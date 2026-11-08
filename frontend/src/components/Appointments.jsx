import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel, Tiles } from "./ui";

const SLOTS = Array.from({ length: 24 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const todayStr = () => new Date().toLocaleDateString("en-CA");
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString("en-CA"); };
const maxDay = () => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toLocaleDateString("en-CA"); };
const pretty = (s) => new Date(`${s.slice(0, 10)}T${s.slice(11, 16)}:00`).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const WORDS = { REQUESTED: "Waiting for the doctor", CONFIRMED: "Confirmed", DECLINED: "Declined", CANCELLED: "Cancelled", COMPLETED: "Completed" };
const Badge = ({ s }) => <span className={`badge ${s}`}>{WORDS[s]}</span>;

function SlotPicker({ date, setDate, time, setTime }) {
  return (
    <div className="inline">
      <input type="date" required aria-label="Date" value={date} min={tomorrow()} max={maxDay()} onChange={(e) => setDate(e.target.value)} />
      <select aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)}>{SLOTS.map((t) => <option key={t}>{t}</option>)}</select>
    </div>
  );
}

// Shared by both roles: patients book and cancel, doctors answer.
export default function Appointments({ role }) {
  const { call } = useAuth();
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [when, setWhen] = useState("upcoming");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ doctor_id: "", date: tomorrow(), time: "10:00", reason: "" });
  const [moving, setMoving] = useState(null); // doctor: appointment being rescheduled
  const [mv, setMv] = useState({ date: tomorrow(), time: "10:00" });

  const load = useCallback(async () => {
    try { const r = await call(`/appointments?when=${when}&limit=20`); setRows(r.data); setMore(r.meta?.has_more); setPage(1); setError(""); }
    catch (e) { setError(e.message); }
  }, [call, when]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (role !== "PATIENT") return;
    call("/appointments/doctors").then((r) => { setDoctors(r.data); setForm((f) => ({ ...f, doctor_id: f.doctor_id || String(r.data[0]?.doctor_id || "") })); }).catch((e) => setError(e.message));
  }, [call, role]);

  async function loadMore() {
    try { const r = await call(`/appointments?when=${when}&limit=20&page=${page + 1}`); setRows((cur) => cur.concat(r.data)); setMore(r.meta?.has_more); setPage(page + 1); }
    catch (e) { setError(e.message); }
  }
  async function act(a, action, body, message) {
    setError(""); setOk("");
    try { await call(`/appointments/${a.appointment_id}/${action}`, { method: "POST", body: body || {} }); setOk(message); setMoving(null); load(); }
    catch (e) { setError(e.message); }
  }
  async function book(e) {
    e.preventDefault(); setError(""); setOk("");
    try {
      await call("/appointments", { method: "POST", body: { doctor_id: Number(form.doctor_id), scheduled_at: `${form.date} ${form.time}`, reason: form.reason } });
      setOk("Request sent. You will be notified when the doctor answers."); setForm({ ...form, reason: "" }); setWhen("upcoming"); load();
    } catch (err) { setError(err.message); }
  }
  function decline(a) {
    const note = window.prompt(`Why are you declining ${a.patient_name}'s request? (the patient will see this)`);
    if (note && note.trim().length >= 3) act(a, "decline", { note: note.trim() }, "Request declined.");
  }

  const waiting = rows.filter((r) => r.status === "REQUESTED").length;
  const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
  return (
    <>
      <Tiles items={[[waiting, role === "DOCTOR" ? "Requests to answer" : "Waiting for the doctor", "orange"], [confirmed, "Confirmed", "purple"], [rows.length, when === "upcoming" ? "Upcoming" : "Past", "yellow"]]} />
      {role === "PATIENT" && (
        <Panel title="Book an appointment">
          <form className="form" onSubmit={book}>
            <label>Doctor
              <select required value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
                {doctors.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.name} — {d.specialization}</option>)}
              </select>
            </label>
            <label>Date and time (clinic hours 08:00 – 19:30)</label>
            <SlotPicker date={form.date} setDate={(date) => setForm({ ...form, date })} time={form.time} setTime={(time) => setForm({ ...form, time })} />
            <label>Reason for the visit<input required minLength={3} maxLength={255} placeholder="e.g. Follow-up for blood pressure" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            <button type="submit">Request appointment</button>
          </form>
        </Panel>
      )}
      <Panel title={role === "DOCTOR" ? "Appointments" : "My appointments"}>
        <nav className="tabs" role="tablist">
          {[["upcoming", "Upcoming"], ["past", "Past"]].map(([k, l]) => <button key={k} role="tab" aria-selected={when === k} className={when === k ? "" : "secondary"} onClick={() => setWhen(k)}>{l}</button>)}
        </nav>
        <Notice error={error} success={ok} />
        <List rows={rows} empty={when === "upcoming" ? "No upcoming appointments." : "No past appointments."} render={(a) => (
          <>
            <strong>{pretty(a.scheduled_at)} <Badge s={a.status} /></strong>
            <span>{role === "DOCTOR" ? `${a.patient_name}` : `${a.doctor_name} (${a.specialization})`} · {a.reason}</span>
            {a.doctor_note && <span>Doctor's note: {a.doctor_note}</span>}
            {moving === a.appointment_id && (
              <div className="inline">
                <SlotPicker date={mv.date} setDate={(date) => setMv({ ...mv, date })} time={mv.time} setTime={(time) => setMv({ ...mv, time })} />
                <button onClick={() => act(a, "reschedule", { scheduled_at: `${mv.date} ${mv.time}` }, "Appointment moved and confirmed.")}>Move</button>
                <button className="secondary" onClick={() => setMoving(null)}>Close</button>
              </div>
            )}
            <div className="actions">
              {role === "PATIENT" && ["REQUESTED", "CONFIRMED"].includes(a.status) && !a.is_past && (
                <button className="secondary" onClick={() => window.confirm("Cancel this appointment?") && act(a, "cancel", {}, "Appointment cancelled.")}>Cancel</button>
              )}
              {role === "DOCTOR" && a.status === "REQUESTED" && !a.is_past && <button onClick={() => act(a, "confirm", {}, "Appointment confirmed.")}>Confirm</button>}
              {role === "DOCTOR" && a.status === "REQUESTED" && !a.is_past && <button className="secondary" onClick={() => decline(a)}>Decline</button>}
              {role === "DOCTOR" && ["REQUESTED", "CONFIRMED"].includes(a.status) && !a.is_past && <button className="secondary" onClick={() => { setMoving(a.appointment_id); setMv({ date: a.scheduled_at.slice(0, 10) > todayStr() ? a.scheduled_at.slice(0, 10) : tomorrow(), time: a.scheduled_at.slice(11, 16) }); }}>Reschedule</button>}
              {role === "DOCTOR" && a.status === "CONFIRMED" && a.is_past ? <button onClick={() => act(a, "complete", {}, "Marked as completed.")}>Mark completed</button> : null}
            </div>
          </>
        )} />
        {more && <button className="secondary" onClick={loadMore}>Load more</button>}
      </Panel>
    </>
  );
}
