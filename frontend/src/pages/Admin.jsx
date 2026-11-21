import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel, Tiles, useGoto } from "../components/ui";
import { Donut } from "../components/Charts";
import { downloadFile } from "../components/download";
import AshBurstButton from "../components/AshBurstButton";
import { confirmDialog, promptDialog } from "../components/Dialog";
import { pickTab } from "../router";
import AuditLog from "../components/AuditLog";
import AdminAnalytics from "../components/AdminAnalytics";
import SideTabs from "../components/SideTabs";

const TABS = [["users", "Users"], ["create", "Create account"], ["pharmacy", "New pharmacy"], ["analytics", "Analytics"], ["reports", "Reports"], ["audit", "Audit log"], ["automation", "Automation"]];
const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Admin" };

// The open tab comes from the address bar (see router.js).
export default function Admin({ tab: shownTab, setTab }) {
  const tab = pickTab(shownTab, TABS.map(([k]) => k), "users");
  useGoto(setTab);
  const [flash, setFlash] = useState({});
  const go = (k) => { setTab(k); setFlash({}); };
  const activeLabel = TABS.find(([key]) => key === tab)?.[1] || "Overview";
  const tabIcons = { users: "♙", create: "+", pharmacy: "⌁", analytics: "◔", reports: "↓", audit: "◌", automation: "✦" };
  return (
    <section className="admin-workspace">
      <header className="admin-hero">
        <div className="admin-orbit admin-orbit-one" aria-hidden="true" />
        <div className="admin-orbit admin-orbit-two" aria-hidden="true" />
        <div className="admin-hero-copy">
          <div className="admin-kicker"><span className="admin-kicker-mark">✦</span> MedSync command center</div>
          <h1>Administration, <em>made clear.</em></h1>
          <p>Manage people, operational intelligence, exports and care automation from one focused workspace.</p>
          <div className="admin-trust-row" aria-label="Workspace capabilities">
            <span>Secure operations</span><i aria-hidden="true" /><span>Care coordination</span><i aria-hidden="true" /><span>Live oversight</span>
          </div>
        </div>
        <div className="admin-hero-status" aria-label="Current workspace">
          <span className="admin-live-dot" aria-hidden="true" />
          <div><small>Current workspace</small><strong>{activeLabel}</strong></div>
          <span className="admin-status-arrow" aria-hidden="true">↗</span>
        </div>
      </header>
      <SideTabs label="Administration sections">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>
          <span className="admin-tab-icon" aria-hidden="true">{tabIcons[k]}</span><span>{l}</span>
        </button>)}
      </SideTabs>
      <div className="admin-content">
        <Notice {...flash} />
        {tab === "users" && <Users setFlash={setFlash} />}
        {tab === "create" && <CreateAccount done={(m) => { setFlash({ success: m }); setTab("users"); }} />}
        {tab === "analytics" && <AdminAnalytics />}
        {tab === "reports" && <Reports />}
        {tab === "audit" && <AuditLog />}
        {tab === "automation" && <Automation />}
        {tab === "pharmacy" && <NewPharmacy done={(m) => { setFlash({ success: m }); setTab("create"); }} />}
      </div>
    </section>
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
    const ok = await confirmDialog({
      title: `${next ? "Re-activate" : "Deactivate"} ${u.name}?`,
      message: next ? "They will be able to sign in again." : "They will be signed out immediately and cannot sign in until you re-activate the account. Nothing is deleted.",
      confirmLabel: next ? "Re-activate" : "Deactivate", danger: !next,
    });
    if (!ok) return;
    try { await call(`/admin/users/${u.user_id}/active`, { method: "PATCH", body: { is_active: next } }); setFlash({ success: `${u.name} ${next ? "re-activated" : "deactivated"}.` }); load(page); }
    catch (e) { setError(e.message); }
  }

  // Permanent. The admin must type the person's email, and is told what disappears with them.
  async function remove(u) {
    const what = u.role === "PATIENT" ? "ALL their prescriptions, reminders, appointments and uploaded files"
      : u.role === "DOCTOR" ? "ALL prescriptions they wrote (also from their patients' history), their templates and appointments"
      : "the dispensing records they entered";
    const typed = await promptDialog({
      title: `Permanently delete ${u.name}?`,
      message: [`${ROLE_TEXT[u.role]} account. This also deletes ${what}.`, "It cannot be undone. If you only want to block sign-in, use Deactivate instead."],
      label: "Their email address", match: u.email, confirmLabel: "Delete permanently", danger: true,
    });
    if (typed === null) return false;
    try {
      const r = await call(`/admin/users/${u.user_id}`, { method: "DELETE", body: { confirm_email: typed.trim() } });
      setFlash({ success: `${u.name} was deleted permanently${r.data.prescriptions_removed ? ` together with ${r.data.prescriptions_removed} prescription(s)` : ""}.` });
      setError("");
      return true; // the ash animation plays, then the list reloads (see AshBurstButton)
    } catch (e) { setError(e.message); return false; }
  }

  async function resetPw(u) {
    const pw = await promptDialog({
      title: `Reset password for ${u.name}`,
      message: "Type a new temporary password. They will be signed out everywhere and should change it after signing in.",
      label: "New temporary password", type: "password", confirmLabel: "Reset password",
      validate: (p) => (p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p) ? "" : "At least 8 characters with a letter and a number."),
    });
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
            {u.user_id !== user.user_id && <div className="actions"><button className="secondary" onClick={() => resetPw(u)}>Reset password</button><button className="secondary" onClick={() => toggle(u)}>{u.is_active ? "Deactivate" : "Re-activate"}</button>{u.role !== "ADMIN" && <AshBurstButton label="Delete" className="danger" action={() => remove(u)} onBurned={() => load(page)} />}</div>}
          </>
        )} />
        {more && <button className="secondary" onClick={loadMore}>Load more</button>}
      </Panel>
    </>
  );
}

// CSV reports for spreadsheets. Each download is recorded in the audit log.
function Reports() {
  const { call } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({});
  async function get(report, query = "") {
    setBusy(report); setNote({});
    try { await downloadFile(call, `/export/admin/${report}${query}`, `medsync-${report}-${today}.csv`); setNote({ success: "Download started." }); }
    catch (e) { setNote({ error: e.message }); } finally { setBusy(""); }
  }
  return (
    <>
      <Notice {...note} />
      <Panel title="Accounts">
        <p className="muted">Every account with its role, whether it is active, and the licence or pharmacy. Password data is never included.</p>
        <button disabled={!!busy} onClick={() => get("users")}>{busy === "users" ? "Preparing…" : "Download users (CSV)"}</button>
      </Panel>
      <Panel title="Pharmacy stock">
        <p className="muted">Every batch in every pharmacy with its quantity and expiry state.</p>
        <button disabled={!!busy} onClick={() => get("stock")}>{busy === "stock" ? "Preparing…" : "Download stock (CSV)"}</button>
      </Panel>
      <Panel title="Audit log">
        <p className="muted">Who did what and when. The free-text details are left out because they can contain clinical wording.</p>
        <div className="inline">
          <label>From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <button disabled={!!busy || !from || !to} onClick={() => get("audit", `?from=${from}&to=${to}`)}>{busy === "audit" ? "Preparing…" : "Download audit log (CSV)"}</button>
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

