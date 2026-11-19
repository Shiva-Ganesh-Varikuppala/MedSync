import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "./ui";
import { downloadFile } from "./download";
import "./CareCalendar.css";

// The patient's calendar: doses (coloured by outcome), appointments and prescription start/end dates.
// Month or week view; click a day to see it in detail and answer doses that are due.
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const timeOf = (s) => s.slice(11, 16);
const dayOf = (s) => s.slice(0, 10);
const when = (s) => new Date(s.replace(" ", "T"));

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOSE_TEXT = { PENDING: "Pending", TAKEN: "Taken", SKIPPED: "Skipped", MISSED: "Missed" };
const APPT_TEXT = { REQUESTED: "Requested", CONFIRMED: "Confirmed", DECLINED: "Declined", CANCELLED: "Cancelled", COMPLETED: "Completed" };

function rangeFor(view, cursor) {
  if (view === "week") { const start = mondayOf(cursor); return { start, end: addDays(start, 6) }; }
  const start = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return { start, end: addDays(start, 41) };
}

function titleFor(view, cursor, range) {
  if (view === "month") return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const f = (d, y) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) });
  return `${f(range.start)} – ${f(range.end, true)}`;
}

export default function CareCalendar() {
  const { call } = useAuth();
  const today = keyOf(new Date());
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(0);
  const latest = useRef(0);

  const range = rangeFor(view, cursor);
  const from = keyOf(range.start), to = keyOf(range.end);

  const load = useCallback(async () => {
    const n = ++latest.current; // ignore an older answer that arrives after a newer request
    try {
      const r = await call(`/patients/me/calendar?from=${from}&to=${to}`);
      if (n === latest.current) { setData(r.data); setError(""); }
    } catch (e) { if (n === latest.current) setError(e.message); }
  }, [call, from, to]);
  useEffect(() => { load(); }, [load]);

  async function answer(id, status) {
    setBusy(id);
    try { await call(`/reminders/${id}/status`, { method: "PATCH", body: { status } }); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(0); }
  }

  // Group everything by day once.
  const by = { doses: {}, appts: {}, starts: {}, ends: {} };
  if (data) {
    data.reminders.forEach((r) => (by.doses[dayOf(r.scheduled_at)] ||= []).push(r));
    data.appointments.forEach((a) => (by.appts[dayOf(a.scheduled_at)] ||= []).push(a));
    data.courses.forEach((c) => { (by.starts[c.start_date] ||= []).push(c); (by.ends[c.end_date] ||= []).push(c); });
  }

  const step = (dir) => setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1) : addDays(cursor, 7 * dir));
  const goToday = () => { setCursor(new Date()); setSelected(today); };
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => addDays(range.start, i));
  const now = new Date();

  const count = (list, status) => list.filter((d) => d.status === status).length;

  return (
    <>
      <Panel title="Care calendar">
        <div className="cal-bar">
          <div className="cal-nav">
            <button className="secondary" onClick={() => step(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>‹</button>
            <button className="secondary" onClick={goToday}>Today</button>
            <button className="secondary" onClick={() => step(1)} aria-label={view === "month" ? "Next month" : "Next week"}>›</button>
          </div>
          <h3 className="cal-title" aria-live="polite">{titleFor(view, cursor, range)}</h3>
          <div className="cal-nav" role="group" aria-label="Calendar view">
            <button className={view === "month" ? "" : "secondary"} onClick={() => setView("month")}>Month</button>
            <button className={view === "week" ? "" : "secondary"} onClick={() => setView("week")}>Week</button>
          </div>
        </div>
        <Notice error={error} />
        <p className="muted">
          <button className="secondary" onClick={() => downloadFile(call, "/patients/me/calendar.ics", "medsync-calendar.ics").catch((e) => setError(e.message))}>Add to my phone calendar (.ics)</button>
          {" "}Upcoming doses and appointments for the next 60 days; open the file on your phone or in Google/Apple/Outlook Calendar.
        </p>
        <ul className="cal-legend" aria-label="Legend">
          <li><i className="cdot taken" /> Taken</li><li><i className="cdot pending" /> Pending</li><li><i className="cdot skipped" /> Skipped</li><li><i className="cdot missed" /> Missed</li><li><i className="cdot appt" /> Appointment</li>
        </ul>
        <div className={`cal-grid ${view}`} role="grid" aria-label="Calendar">
          {WEEKDAYS.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}
          {days.map((d) => {
            const k = keyOf(d);
            const doses = by.doses[k] || [], appts = (by.appts[k] || []).filter((a) => a.status !== "DECLINED" && a.status !== "CANCELLED");
            const out = view === "month" && d.getMonth() !== cursor.getMonth();
            const cls = ["cal-cell", out ? "out" : "", k === today ? "today" : "", k === selected ? "selected" : ""].join(" ").trim();
            const label = `${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}: ${doses.length} dose${doses.length === 1 ? "" : "s"}, ${appts.length} appointment${appts.length === 1 ? "" : "s"}`;
            return (
              <button key={k} role="gridcell" className={cls} onClick={() => setSelected(k)} aria-label={label} aria-pressed={k === selected}>
                <span className="cal-num">{d.getDate()}</span>
                {view === "month" ? (
                  <span className="cal-marks">
                    {["TAKEN", "PENDING", "SKIPPED", "MISSED"].map((s) => count(doses, s) > 0 && <span key={s} className="cmark"><i className={`cdot ${s.toLowerCase()}`} />{count(doses, s)}</span>)}
                    {appts.length > 0 && <span className="cmark"><i className="cdot appt" />{appts.length}</span>}
                    {(by.starts[k] || []).length > 0 && <span className="ctag">Rx starts</span>}
                    {(by.ends[k] || []).length > 0 && <span className="ctag end">Rx ends</span>}
                  </span>
                ) : (
                  <span className="cal-lines">
                    {appts.map((a) => <span key={a.appointment_id} className="cline appt">{timeOf(a.scheduled_at)} Dr {a.doctor_name.replace(/^Dr\.?\s*/i, "")}</span>)}
                    {doses.map((r) => <span key={r.reminder_id} className={`cline ${r.status.toLowerCase()}`}>{timeOf(r.scheduled_at)} {r.medicine_name}</span>)}
                    {(by.starts[k] || []).map((c) => <span key={`s${c.prescription_item_id}`} className="ctag">Starts: {c.medicine_name}</span>)}
                    {(by.ends[k] || []).map((c) => <span key={`e${c.prescription_item_id}`} className="ctag end">Ends: {c.medicine_name}</span>)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!data && !error && <p className="muted">Loading…</p>}
      </Panel>

      <Panel title={parse(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
        <DayDetail
          doses={by.doses[selected] || []} appts={by.appts[selected] || []} starts={by.starts[selected] || []} ends={by.ends[selected] || []}
          now={now} busy={busy} answer={answer} loaded={!!data}
        />
      </Panel>
    </>
  );
}

function DayDetail({ doses, appts, starts, ends, now, busy, answer, loaded }) {
  if (loaded && !doses.length && !appts.length && !starts.length && !ends.length) return <p className="muted">Nothing scheduled for this day.</p>;
  return (
    <div className="cal-day">
      {appts.length > 0 && (
        <section>
          <h4>Appointments</h4>
          <ul className="cal-list">
            {appts.map((a) => (
              <li key={a.appointment_id}>
                <b>{timeOf(a.scheduled_at)}</b> Dr {a.doctor_name.replace(/^Dr\.?\s*/i, "")}{a.specialization ? ` · ${a.specialization}` : ""}
                <span className="muted"> · {a.reason}</span> <span className={`cpill ${a.status.toLowerCase()}`}>{APPT_TEXT[a.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {doses.length > 0 && (
        <section>
          <h4>Doses</h4>
          <ul className="cal-list">
            {doses.map((r) => {
              const due = when(r.scheduled_at) <= now;
              const working = busy === r.reminder_id;
              return (
                <li key={r.reminder_id}>
                  <b>{timeOf(r.scheduled_at)}</b> {r.medicine_name} <span className="muted">· {r.dosage}</span> <span className={`cpill ${r.status.toLowerCase()}`}>{DOSE_TEXT[r.status]}</span>
                  <span className="cal-actions">
                    {(r.status === "PENDING" || r.status === "MISSED") && due && (
                      <>
                        <button disabled={working} onClick={() => answer(r.reminder_id, "TAKEN")}>{r.status === "MISSED" ? "I took it late" : "Taken"}</button>
                        {r.status === "PENDING" && <button className="secondary" disabled={working} onClick={() => answer(r.reminder_id, "SKIPPED")}>Skipped</button>}
                      </>
                    )}
                    {(r.status === "TAKEN" || r.status === "SKIPPED") && <button className="link" disabled={working} onClick={() => answer(r.reminder_id, "PENDING")}>Undo</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {(starts.length > 0 || ends.length > 0) && (
        <section>
          <h4>Prescription courses</h4>
          <ul className="cal-list">
            {starts.map((c) => <li key={`s${c.prescription_item_id}`}><span className="ctag">Starts</span> {c.medicine_name} <span className="muted">· {c.dosage}</span></li>)}
            {ends.map((c) => <li key={`e${c.prescription_item_id}`}><span className="ctag end">Last day</span> {c.medicine_name} <span className="muted">· {c.dosage}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
