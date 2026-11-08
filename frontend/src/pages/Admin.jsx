import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel, useGoto } from "../components/ui";
import { Donut } from "../components/Charts";

const TABS = [["users", "Users"], ["create", "Create account"], ["pharmacy", "New pharmacy"], ["automation", "Automation"]];
const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Admin" };

export default function Admin() {
  const [tab, setTab] = useState("users");
  useGoto(setTab);
  const [flash, setFlash] = useState({});
  const go = (k) => { setTab(k); setFlash({}); };
  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => go(k)}>{l}</button>)}
      </nav>
      <Notice {...flash} />
      {tab === "users" && <Users setFlash={setFlash} />}
      {tab === "create" && <CreateAccount done={(m) => { setFlash({ success: m }); setTab("users"); }} />}
      {tab === "automation" && <Automation />}
      {tab === "pharmacy" && <NewPharmacy done={(m) => { setFlash({ success: m }); setTab("create"); }} />}
    </>
  );
}

function Users({ setFlash }) {
  const { call, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);

  // Loads pages 1..upTo again so a change (e.g. deactivate) keeps the list as long as the admin had scrolled.
  const load = useCallback((upTo = 1) => {
    const params = (p) => { const x = new URLSearchParams({ page: p }); if (role) x.set("role", role); if (q.trim()) x.set("q", q.trim()); return x; };
    return Promise.all([call(`/admin/users?${params(1)}`), call("/admin/summary")])
      .then(async ([u, s]) => {
        let items = u.data.items, hasMore = u.data.has_more;
        for (let p = 2; p <= upTo && hasMore; p++) { const n = await call(`/admin/users?${params(p)}`); items = items.concat(n.data.items); hasMore = n.data.has_more; setPage(p); }
        if (upTo === 1) setPage(1);
        setRows(items); setMore(hasMore); setSummary(s.data); setError("");
      })
      .catch((e) => setError(e.message));
  }, [call, role, q]);
  useEffect(() => { const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  async function loadMore() {
    const params = new URLSearchParams({ page: page + 1 }); if (role) params.set("role", role); if (q.trim()) params.set("q", q.trim());
    try { const r = await call(`/admin/users?${params}`); setRows((cur) => cur.concat(r.data.items)); setMore(r.data.has_more); setPage(page + 1); }
    catch (e) { setError(e.message); }
  }

  async function toggle(u) {
    const next = !u.is_active;
    if (!window.confirm(`${next ? "Re-activate" : "Deactivate"} ${u.name}? ${next ? "" : "They will be signed out immediately."}`)) return;
    try { await call(`/admin/users/${u.user_id}/active`, { method: "PATCH", body: { is_active: next } }); setFlash({ success: `${u.name} ${next ? "re-activated" : "deactivated"}.` }); load(page); }
    catch (e) { setError(e.message); }
  }

  async function resetPw(u) {
    const pw = window.prompt(`Type a new temporary password for ${u.name}.\nAt least 8 characters with a letter and a number. They will be signed out everywhere.`);
    if (!pw) return;
    try { await call(`/admin/users/${u.user_id}/password`, { method: "POST", body: { new_password: pw } }); setFlash({ success: `Password reset for ${u.name}. Give them the new password and ask them to change it.` }); setError(""); }
    catch (e) { setError(e.message); }
  }

  return (
    <>
      {summary && (
        <section className="stats">
          {[["Doctors", summary.doctors], ["Patients", summary.patients], ["Pharmacy staff", summary.pharmacy_staff], ["Pharmacies", summary.pharmacies], ["Deactivated", summary.deactivated]].map(([l, n]) => (
            <div className="card stat-card" key={l}><p className="stat">{n}</p><p className="muted">{l}</p></div>
          ))}
        </section>
      )}
      {summary && <Panel title="Accounts by role"><Donut center={summary.doctors + summary.patients + summary.pharmacy_staff} caption="accounts" parts={[{ label: "Patients", value: summary.patients, color: "#7b5cf0" }, { label: "Doctors", value: summary.doctors, color: "#ff8a4c" }, { label: "Pharmacy staff", value: summary.pharmacy_staff, color: "#ffc145" }]} /></Panel>}
      <Panel title="All users">
        <div className="inline">
          <input className="filter" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {Object.entries(ROLE_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Notice error={error} />
        <List rows={rows} empty="No users match." render={(u) => (
          <>
            <strong>{u.name} <span className="badge">{ROLE_TEXT[u.role]}</span> {!u.is_active && <span className="badge EXPIRED">Deactivated</span>}</strong>
            <span>{u.email}{u.specialization ? ` · ${u.specialization} (${u.license_number})` : ""}{u.pharmacy_name ? ` · ${u.pharmacy_name}` : ""}</span>
            {u.user_id !== user.user_id && <div className="actions"><button className="secondary" onClick={() => resetPw(u)}>Reset password</button><button className="secondary" onClick={() => toggle(u)}>{u.is_active ? "Deactivate" : "Re-activate"}</button></div>}
          </>
        )} />
        {more && <button className="secondary" onClick={loadMore}>Load more</button>}
      </Panel>
    </>
  );
}

function Automation() {
  const { call } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [testing, setTesting] = useState("");
  const [testMsg, setTestMsg] = useState({});
  useEffect(() => { call("/admin/delivery").then((r) => setDelivery(r.data)).catch((e) => setError(e.message)); }, [call]);
  async function test(channel) {
    setTesting(channel); setTestMsg({});
    try { const r = await call("/admin/delivery/test", { method: "POST", body: { channel } }); setTestMsg({ success: r.message }); }
    catch (e) { setTestMsg({ error: e.message }); }
    setTesting("");
  }
  async function run() {
    setBusy(true); setError("");
    try { const r = await call("/admin/cron/run", { method: "POST" }); setResult({ ...r.data, at: new Date().toLocaleTimeString() }); }
    catch (e) { setError(e.message); }
    setBusy(false);
  }
  return (
    <>
      <Panel title="Reminder tasks">
        <p>MedSync runs two background jobs on a schedule. You can run them right now, for example to check that reminders are working.</p>
        <ul className="muted">
          <li><b>Mark missed doses:</b> reminders still unanswered two hours after their time become "Missed".</li>
          <li><b>Send reminders:</b> doses that are due now are sent to the patient as notifications (and by email when email is set up on the server).</li>
        </ul>
        <Notice error={error} />
        <button onClick={run} disabled={busy}>{busy ? "Running…" : "Run reminder tasks now"}</button>
      </Panel>
      <Panel title="Email and SMS">
        <p>Reminders and notices always appear inside MedSync. To also send them by email or text message, add the settings to the server's <code>.env</code> file and restart it (see <code>.env.example</code>).</p>
        {delivery && (
          <ul className="muted">
            <li><b>Email:</b> {delivery.email.configured ? `on, sending from ${delivery.email.from} through ${delivery.email.host}` : "off (inside MedSync only)"}</li>
            <li><b>SMS:</b> {delivery.sms.configured ? `on, sending from ${delivery.sms.from}` : "off (inside MedSync only)"}</li>
          </ul>
        )}
        <Notice {...testMsg} />
        <div className="actions">
          <button className="secondary" disabled={!delivery?.email.configured || !!testing} onClick={() => test("EMAIL")}>{testing === "EMAIL" ? "Sending…" : "Send me a test email"}</button>
          <button className="secondary" disabled={!delivery?.sms.configured || !!testing} onClick={() => test("SMS")}>{testing === "SMS" ? "Sending…" : "Send me a test SMS"}</button>
        </div>
      </Panel>
      {result && (
        <section className="stats">
          {[["Doses marked as missed", result.transitioned_to_missed_count], ["Reminders sent", result.reminders_dispatched_count]].map(([l, n]) => (
            <div className="card stat-card" key={l}><p className="stat">{n}</p><p className="muted">{l}</p></div>
          ))}
          <p className="muted small">Last run at {result.at}.</p>
        </section>
      )}
    </>
  );
}

function CreateAccount({ done }) {
  const { call } = useAuth();
  const [role, setRole] = useState("DOCTOR");
  const [pharmacies, setPharmacies] = useState([]);
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "", license_number: "", specialization: "", pharmacy_id: "" });
  const [error, setError] = useState("");
  useEffect(() => { call("/pharmacies").then((r) => setPharmacies(r.data)).catch((e) => setError(e.message)); }, [call]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const body = { role, name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim() || undefined };
    if (role === "DOCTOR") Object.assign(body, { license_number: f.license_number.trim(), specialization: f.specialization.trim() });
    else body.pharmacy_id = Number(f.pharmacy_id);
    try { await call("/admin/users", { method: "POST", body }); done(`${ROLE_TEXT[role]} account created for ${f.name}. Give them the temporary password and ask them to change it.`); }
    catch (err) { setError(err.message); }
  }
  return (
    <Panel title="Create a doctor or pharmacy-staff account">
      <form className="form" onSubmit={submit}>
        <label>Account type
          <select value={role} onChange={(e) => setRole(e.target.value)}><option value="DOCTOR">Doctor</option><option value="PHARMACY_STAFF">Pharmacy staff</option></select>
        </label>
        <label>Full name<input required value={f.name} onChange={set("name")} /></label>
        <label>Email<input required type="email" value={f.email} onChange={set("email")} /></label>
        <label>Temporary password<input required type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set("password")} /></label>
        <p className="muted small">At least 8 characters with a letter and a number.</p>
        <label>Phone (optional)<input value={f.phone} onChange={set("phone")} /></label>
        {role === "DOCTOR" ? (
          <>
            <label>Medical licence number<input required value={f.license_number} onChange={set("license_number")} /></label>
            <label>Specialization<input required value={f.specialization} onChange={set("specialization")} /></label>
          </>
        ) : (
          <label>Pharmacy
            <select required value={f.pharmacy_id} onChange={set("pharmacy_id")}>
              <option value="">Select a pharmacy</option>
              {pharmacies.map((p) => <option key={p.pharmacy_id} value={p.pharmacy_id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <Notice error={error} />
        <button>Create account</button>
      </form>
    </Panel>
  );
}

function NewPharmacy({ done }) {
  const { call } = useAuth();
  const [f, setF] = useState({ name: "", address: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { await call("/admin/pharmacies", { method: "POST", body: { ...f, email: f.email.trim() || undefined } }); done(`Pharmacy "${f.name}" created. You can now add staff to it.`); }
    catch (err) { setError(err.message); }
  }
  return (
    <Panel title="Add a pharmacy">
      <form className="form" onSubmit={submit}>
        <label>Name<input required value={f.name} onChange={set("name")} /></label>
        <label>Address<input required value={f.address} onChange={set("address")} /></label>
        <label>Phone<input required value={f.phone} onChange={set("phone")} /></label>
        <label>Email (optional)<input type="email" value={f.email} onChange={set("email")} /></label>
        <Notice error={error} />
        <button>Create pharmacy</button>
      </form>
    </Panel>
  );
}
