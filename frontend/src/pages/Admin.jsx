import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "../components/ui";

const TABS = [["users", "Users"], ["create", "Create account"], ["pharmacy", "New pharmacy"]];
const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Admin" };

export default function Admin() {
  const [tab, setTab] = useState("users");
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

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (q.trim()) params.set("q", q.trim());
    return Promise.all([call(`/admin/users?${params}`), call("/admin/summary")])
      .then(([u, s]) => { setRows(u.data.items); setSummary(s.data); setError(""); })
      .catch((e) => setError(e.message));
  }, [call, role, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function toggle(u) {
    const next = !u.is_active;
    if (!window.confirm(`${next ? "Re-activate" : "Deactivate"} ${u.name}? ${next ? "" : "They will be signed out immediately."}`)) return;
    try { await call(`/admin/users/${u.user_id}/active`, { method: "PATCH", body: { is_active: next } }); setFlash({ success: `${u.name} ${next ? "re-activated" : "deactivated"}.` }); load(); }
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
            {u.user_id !== user.user_id && <div className="actions"><button className="secondary" onClick={() => toggle(u)}>{u.is_active ? "Deactivate" : "Re-activate"}</button></div>}
          </>
        )} />
      </Panel>
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
