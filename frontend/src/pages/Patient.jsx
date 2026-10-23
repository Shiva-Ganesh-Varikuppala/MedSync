import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "../components/ui";
import PrescriptionDetail from "../components/PrescriptionDetail";

const hhmm = (s) => s.slice(11, 16);
const day = (s) => s.slice(0, 10);
const prettyDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function Patient() {
  const [tab, setTab] = useState("today");
  return (
    <>
      <nav className="tabs" role="tablist">
        {[
          ["today", "Today & reminders"],
          ["rx", "My prescriptions"],
          ["alerts", "Alerts & Notifications"]
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === "today" && <Reminders />}
      {tab === "rx" && <Prescriptions />}
      {tab === "alerts" && <PatientNotifications />}
    </>
  );
}

function Reminders() {
  const { call } = useAuth();
  const [due, setDue] = useState([]);
  const [all, setAll] = useState([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([call("/reminders/due"), call("/patients/me/reminders")]);
      setDue(d.data); setAll(a.data); setError("");
    } catch (e) { setError(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);

  async function answer(id, status) {
    try { await call(`/reminders/${id}/status`, { method: "PATCH", body: { status } }); load(); }
    catch (e) { setError(e.message); }
  }

  const dueIds = new Set(due.map((r) => r.reminder_id));
  const upcoming = all.filter((r) => r.status === "PENDING" && !dueIds.has(r.reminder_id));
  const byDay = upcoming.reduce((acc, r) => { (acc[day(r.scheduled_at)] ||= []).push(r); return acc; }, {});
  const days = Object.keys(byDay).sort().slice(0, 7);

  const taken = all.filter((r) => r.status === "TAKEN").length;
  const skipped = all.filter((r) => r.status === "SKIPPED").length;
  const missed = all.filter((r) => r.status === "MISSED").length;
  const totalCompletedOrMissed = taken + skipped + missed;
  const adherence = totalCompletedOrMissed > 0 ? Math.round((taken / totalCompletedOrMissed) * 100) : 100;

  return (
    <>
      <Notice error={error} />
      <Panel title="Doses to confirm">
        {due.length === 0 ? <p className="muted">You are all caught up. 🎉</p> : (
          <List rows={due} render={(r) => (
            <>
              <strong>{r.medicine_name} — {r.dosage}</strong>
              <span>Was due {prettyDay(day(r.scheduled_at))} at {hhmm(r.scheduled_at)}</span>
              <div className="actions">
                <button onClick={() => answer(r.reminder_id, "TAKEN")}>Taken</button>
                <button className="secondary" onClick={() => answer(r.reminder_id, "SKIPPED")}>Skipped</button>
              </div>
            </>
          )} />
        )}
      </Panel>
      <section className="grid">
        <Panel title="Upcoming doses (next 7 days)">
          {days.length === 0 ? <p className="muted">No upcoming doses.</p> : days.map((d) => (
            <div key={d} className="day">
              <h3>{prettyDay(d)}</h3>
              <ul className="timetable">
                {byDay[d].map((r) => <li key={r.reminder_id}><b>{hhmm(r.scheduled_at)}</b> {r.medicine_name} <span className="muted">· {r.dosage}</span></li>)}
              </ul>
            </div>
          ))}
        </Panel>
        <Panel title="Medication Adherence">
          <p className="stat">{totalCompletedOrMissed > 0 ? `${adherence}%` : "100%"}</p>
          <div style={{ background: "#e7eef0", height: "10px", borderRadius: "99px", overflow: "hidden", margin: "0.6rem 0 1rem" }}>
            <div style={{ width: `${adherence}%`, background: adherence >= 80 ? "#16743c" : adherence >= 50 ? "#9b5c00" : "#a61b1b", height: "100%" }} />
          </div>
          <p className="muted" style={{ fontSize: "0.9rem", margin: "0.2rem 0" }}>
            ✓ <b>{taken}</b> taken · <b>{skipped}</b> skipped {missed > 0 ? `· ⚠️ ${missed} missed` : ""}
          </p>
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            {adherence >= 85 ? "Excellent medication adherence! Keep it up." : adherence >= 60 ? "Good progress. Try not to miss scheduled doses." : "Adherence needs attention. Speak to your doctor if you experience side effects."}
          </p>
        </Panel>
      </section>
    </>
  );
}

function Prescriptions() {
  const { call } = useAuth();
  const [mode, setMode] = useState("active");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setRows(null); setOpen(null);
    call(mode === "active" ? "/patients/me/prescriptions/active" : "/patients/me/prescriptions?status=past")
      .then((r) => { setRows(r.data); setError(""); }).catch((e) => setError(e.message));
  }, [mode, call]);
  return (
    <Panel title="My prescriptions">
      <div className="tabs">
        <button className={mode === "active" ? "" : "secondary"} onClick={() => setMode("active")}>Active</button>
        <button className={mode === "past" ? "" : "secondary"} onClick={() => setMode("past")}>History</button>
      </div>
      <Notice error={error} />
      {rows && <List rows={rows} empty={mode === "active" ? "No active prescriptions." : "No past prescriptions."} render={(p) => (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{p.diagnosis || "Prescription course"}</strong>
            <span className={`badge ${p.status === "DISPENSED" ? "DISPENSED" : p.status === "CANCELLED" ? "EXPIRED" : ""}`}>
              {p.status}
            </span>
          </div>
          <span>Prescribed by {p.doctor_name} · {p.prescription_date}</span>
          <button className="link" onClick={() => setOpen(open === p.prescription_id ? null : p.prescription_id)}>
            {open === p.prescription_id ? "Hide details" : "View details & official slip"}
          </button>
          {open === p.prescription_id && <PrescriptionDetail id={p.prescription_id} />}
        </>
      )} />}
    </Panel>
  );
}

function PatientNotifications() {
  const { call } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    call("/patients/me/notifications").then((r) => setItems(r.data)).catch((e) => setError(e.message));
  }, [call]);

  useEffect(() => { load(); }, [load]);

  return (
    <Panel title="Dose Alerts & Notifications Inbox">
      <Notice error={error} />
      <List
        rows={items}
        empty="No notification alerts have been sent yet. Active reminders will trigger alerts to your registered contact channel."
        render={(n) => (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{n.title}</strong>
              <span className="badge">{n.channel}</span>
            </div>
            <p style={{ margin: "0.2rem 0", fontSize: "0.9rem" }}>{n.message}</p>
            <span style={{ fontSize: "0.8rem", color: "#627d98" }}>
              Delivered to {n.recipient} on {n.sent_at?.slice(0, 16).replace("T", " ")}
            </span>
          </>
        )}
      />
    </Panel>
  );
}
