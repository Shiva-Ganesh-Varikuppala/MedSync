import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "../components/ui";

const TABS = [
  ["users", "Users"],
  ["create", "Create account"],
  ["pharmacy", "New pharmacy"],
  ["automation", "Automation & Cron"]
];
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
      {tab === "automation" && <Automation setFlash={setFlash} />}
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
          <input className="filter" placeholder="Search by name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter users" />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {Object.entries(ROLE_TEXT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Notice error={error} />
        <List rows={rows} empty="No users match." render={(u) => (
          <>
            <strong>
              {u.name} <span className="badge">{ROLE_TEXT[u.role]}</span>
              {!u.is_active && <span className="badge EXPIRED">Deactivated</span>}
            </strong>
            <span>{u.email} · {u.phone || "no phone"}</span>
            {u.user_id !== user.id && (
              <div className="actions">
                <button className="secondary" onClick={() => toggle(u)}>{u.is_active ? "Deactivate" : "Re-activate"}</button>
              </div>
            )}
          </>
        )} />
      </Panel>
    </>
  );
}

function CreateAccount({ done }) {
  const { call } = useAuth();
  const [pharmacies, setPharmacies] = useState([]);
  const [f, setF] = useState({ role: "DOCTOR", name: "", email: "", password: "", phone: "", license_number: "", specialization: "General Practice", pharmacy_id: "" });
  const [error, setError] = useState("");

  useEffect(() => { call("/pharmacies").then((r) => setPharmacies(r.data)).catch(() => {}); }, [call]);

  async function submit(e) {
    e.preventDefault();
    try {
      const body = { ...f, pharmacy_id: f.role === "PHARMACY_STAFF" ? Number(f.pharmacy_id) : undefined };
      await call("/admin/users", { method: "POST", body });
      done(`Created ${ROLE_TEXT[f.role]} account for ${f.name} (${f.email}).`);
    } catch (err) { setError(err.message); }
  }

  return (
    <Panel title="Create doctor or pharmacy staff account">
      <form className="form" onSubmit={submit}>
        <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="DOCTOR">Doctor</option>
          <option value="PHARMACY_STAFF">Pharmacy staff</option>
        </select></label>
        <label>Full name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Email<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Temporary password<input required type="password" minLength={8} placeholder="8+ chars with letter and number" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label>Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>

        {f.role === "DOCTOR" && (
          <>
            <label>Medical license number<input required value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} /></label>
            <label>Specialization<input required value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} /></label>
          </>
        )}

        {f.role === "PHARMACY_STAFF" && (
          <label>Assigned pharmacy<select required value={f.pharmacy_id} onChange={(e) => setF({ ...f, pharmacy_id: e.target.value })}>
            <option value="">Choose a pharmacy…</option>
            {pharmacies.map((p) => <option key={p.pharmacy_id} value={p.pharmacy_id}>{p.name} ({p.address})</option>)}
          </select></label>
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
  async function submit(e) {
    e.preventDefault();
    try {
      await call("/admin/pharmacies", { method: "POST", body: f });
      done(`Pharmacy "${f.name}" registered.`);
    } catch (err) { setError(err.message); }
  }
  return (
    <Panel title="Register a new pharmacy">
      <form className="form" onSubmit={submit}>
        <label>Pharmacy name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Address<input required value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label>Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <Notice error={error} />
        <button>Save pharmacy</button>
      </form>
    </Panel>
  );
}

function Automation({ setFlash }) {
  const { call } = useAuth();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call("/health").then((r) => setHealth(r)).catch(() => {});
  }, [call]);

  async function triggerCron() {
    setRunning(true);
    setError("");
    try {
      const res = await call("/admin/cron/run", { method: "POST" });
      setLastResult(res.data);
      setFlash({ success: "Automated maintenance tasks executed successfully." });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.2rem" }}>
      <Notice error={error} />
      <section className="grid">
        <Panel title="System Automation & Schedulers">
          <p className="muted">
            The background worker automatically sweeps past-due reminders beyond the grace period and marks them as <b>MISSED</b>, then actively dispatches lookahead medication alerts to patients.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <button disabled={running} onClick={triggerCron}>
              {running ? "Running cycle..." : "Run Maintenance Cron Cycle Now"}
            </button>
          </div>
          {lastResult && (
            <div style={{ marginTop: "1rem", background: "#f8fbfc", border: "1px solid #e7eef0", padding: "0.8rem", borderRadius: "8px", fontSize: "0.85rem" }}>
              <strong>Execution Output:</strong>
              <p style={{ margin: "0.2rem 0" }}>Timestamp: {lastResult.timestamp}</p>
              <p style={{ margin: "0.2rem 0" }}>Overdue Doses Transitioned to MISSED: <b>{lastResult.transitioned_to_missed_count}</b></p>
              <p style={{ margin: "0.2rem 0" }}>Reminders Dispatched to Patients: <b>{lastResult.reminders_dispatched_count}</b></p>
            </div>
          )}
        </Panel>

        <Panel title="API & Database Telemetry">
          <p className="muted">Live operational health of the backend application cluster.</p>
          {health ? (
            <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
              <div><b>Database Status:</b> <span className="badge">{health.database}</span></div>
              <div><b>API Health:</b> <span className="badge">{health.message}</span></div>
              <div><b>Cron Worker:</b> <span className="badge">Active (60s tick)</span></div>
            </div>
          ) : (
            <p className="muted">Checking telemetry...</p>
          )}
        </Panel>
      </section>
    </div>
  );
}
