import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel, Tiles, rxStatus } from "../components/ui";
import PrescriptionDetail from "../components/PrescriptionDetail";
import { BarChart, Donut } from "../components/Charts";
import { NotificationList } from "../components/Notifications";
import Appointments from "../components/Appointments";

const hhmm = (s) => s.slice(11, 16);
const day = (s) => s.slice(0, 10);
const prettyDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function Patient({ tab: shownTab, setTab: setShownTab }) {
  const [ownTab, setOwnTab] = useState("today");
  const tab = shownTab || ownTab;          // the top-bar bell can switch tabs from outside
  const setTab = setShownTab || setOwnTab;
  return (
    <>
      <nav className="tabs" role="tablist">
        {[["today", "Today & reminders"], ["rx", "My prescriptions"], ["appts", "Appointments"], ["notifications", "Notifications"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === "today" ? <Reminders /> : tab === "rx" ? <Prescriptions /> : tab === "appts" ? <Appointments role="PATIENT" /> : <NotificationList />}
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
  // Doses nobody answered within the grace period are marked MISSED by the server.
  const missed = all.filter((r) => r.status === "MISSED");
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const missedRecent = missed.filter((r) => new Date(r.scheduled_at.replace(" ", "T")) >= weekAgo).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const answered = taken + skipped + missed.length;
  const adherence = answered ? Math.round((taken / answered) * 100) : 0;
  // Doses marked taken on each of the last 7 days, oldest first.
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const key = d.toLocaleDateString("en-CA"); return { label: d.toLocaleDateString(undefined, { weekday: "short" }), value: all.filter((r) => r.status === "TAKEN" && day(r.scheduled_at) === key).length }; });

  return (
    <>
      <Notice error={error} />
      <Tiles items={[[due.length, "Doses to confirm", "orange"], [upcoming.length, "Upcoming doses", "yellow"], [`${adherence}%`, "Adherence so far", "purple"], [missed.length, "Missed doses", "red"]]} />
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
      {missedRecent.length > 0 && (
        <Panel title="Missed doses, last 7 days">
          <p className="muted small">These doses were not answered in time. If you did take one, mark it so your record is correct.</p>
          <List rows={missedRecent} render={(r) => (
            <>
              <strong>{r.medicine_name} — {r.dosage} <span className="badge EXPIRED">Missed</span></strong>
              <span>Was due {prettyDay(day(r.scheduled_at))} at {hhmm(r.scheduled_at)}</span>
              <div className="actions"><button className="secondary" onClick={() => answer(r.reminder_id, "TAKEN")}>I took it late</button></div>
            </>
          )} />
        </Panel>
      )}
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
        <Panel title="Your adherence so far">
          <Donut center={`${adherence}%`} caption="taken" parts={[{ label: "Taken", value: taken, color: "#7b5cf0" }, { label: "Skipped", value: skipped, color: "#ff8a4c" }, { label: "Missed", value: missed.length, color: "#e5484d" }]} />
        </Panel>
      </section>
      <Panel title="Doses taken, last 7 days"><BarChart data={last7} /></Panel>
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
          <strong>{p.diagnosis}</strong>
          <span>{p.doctor_name} · {p.prescription_date} · {rxStatus(p.status)}</span>
          <button className="link" onClick={() => setOpen(open === p.prescription_id ? null : p.prescription_id)}>{open === p.prescription_id ? "Hide" : "Details"}</button>
          {open === p.prescription_id && <PrescriptionDetail id={p.prescription_id} />}
        </>
      )} />}
    </Panel>
  );
}
