import React, { useState } from "react";
import { useAuth } from "../auth";
import CalendarShell from "./CalendarShell";
import { promptDialog } from "./Dialog";

// The doctor's schedule: appointments (act on them right here) and the days prescribed courses end, which are natural follow-up points.
const timeOf = (s) => s.slice(11, 16);
const TEXT = { REQUESTED: "Requested", CONFIRMED: "Confirmed", DECLINED: "Declined", CANCELLED: "Cancelled", COMPLETED: "Completed" };
const live = (a) => a.status !== "DECLINED" && a.status !== "CANCELLED";

export default function DoctorCalendar() {
  const { call } = useAuth();
  const [busy, setBusy] = useState(0);

  const appts = (data, k) => data.appointments.filter((a) => a.scheduled_at.slice(0, 10) === k);
  const ends = (data, k) => data.followups.filter((f) => f.end_date === k);

  async function act(a, action, body, ctx) {
    setBusy(a.appointment_id);
    try { await call(`/appointments/${a.appointment_id}/${action}`, { method: "POST", body }); await ctx.reload(); }
    catch (e) { ctx.setError(e.message); } finally { setBusy(0); }
  }
  async function decline(a, ctx) {
    const note = await promptDialog({ title: `Decline ${a.patient_name}'s request?`, message: "The patient will see your reason.", label: "Reason", multiline: true, minLength: 3, confirmLabel: "Decline request", danger: true });
    if (note) act(a, "decline", { note }, ctx);
  }
  async function reschedule(a, ctx) {
    const at = await promptDialog({ title: `Reschedule ${a.patient_name}'s appointment`, message: "Pick the new date and time. The patient is notified.", label: "New date and time", type: "datetime-local", initial: a.scheduled_at.replace(" ", "T"), confirmLabel: "Reschedule" });
    if (at) act(a, "reschedule", { scheduled_at: at.replace("T", " ").slice(0, 16) }, ctx);
  }

  return (
    <CalendarShell
      title="My schedule"
      path="/doctors/me/calendar"
      legend={[["appt", "Appointment"], ["pending", "Awaiting your answer"], ["followup", "Course ends (follow-up)"]]}
      hasItems={(data, k) => appts(data, k).length + ends(data, k).length > 0}
      cell={(data, k) => {
        const a = appts(data, k).filter(live), open = a.filter((x) => x.status === "REQUESTED").length, f = ends(data, k);
        return {
          label: `${a.length} appointment${a.length === 1 ? "" : "s"}${open ? `, ${open} awaiting your answer` : ""}${f.length ? `, ${f.length} course${f.length === 1 ? "" : "s"} ending` : ""}`,
          marks: (
            <>
              {a.length - open > 0 && <span className="cmark"><i className="cdot appt" />{a.length - open}</span>}
              {open > 0 && <span className="cmark"><i className="cdot pending" />{open}</span>}
              {f.length > 0 && <span className="cmark"><i className="cdot followup" />{f.length}</span>}
            </>
          ),
          lines: (
            <>
              {a.map((x) => <span key={x.appointment_id} className={`cline ${x.status === "REQUESTED" ? "pending" : "appt"}`}>{timeOf(x.scheduled_at)} {x.patient_name}</span>)}
              {f.map((x, i) => <span key={i} className="cline followup">Ends: {x.patient_name}</span>)}
            </>
          ),
        };
      }}
      detail={(data, k, ctx) => {
        const a = appts(data, k), f = ends(data, k);
        return (
          <div className="cal-day">
            {a.length > 0 && (
              <section>
                <h4>Appointments</h4>
                <ul className="cal-list">
                  {a.map((x) => (
                    <li key={x.appointment_id}>
                      <b>{timeOf(x.scheduled_at)}</b> {x.patient_name} <span className="muted">· {x.reason}</span> <span className={`cpill ${x.status.toLowerCase()}`}>{TEXT[x.status]}</span>
                      <span className="cal-actions">
                        {x.status === "REQUESTED" && (
                          <>
                            <button disabled={busy === x.appointment_id} onClick={() => act(x, "confirm", undefined, ctx)}>Confirm</button>
                            <button className="danger-soft" disabled={busy === x.appointment_id} onClick={() => decline(x, ctx)}>Decline</button>
                          </>
                        )}
                        {x.status === "CONFIRMED" && <button disabled={busy === x.appointment_id} onClick={() => act(x, "complete", undefined, ctx)}>Mark completed</button>}
                        {(x.status === "REQUESTED" || x.status === "CONFIRMED") && <button className="secondary" disabled={busy === x.appointment_id} onClick={() => reschedule(x, ctx)}>Reschedule</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {f.length > 0 && (
              <section>
                <h4>Courses ending — consider a follow-up</h4>
                <ul className="cal-list">{f.map((x, i) => <li key={i}><span className="ctag end">Last day</span> {x.patient_name} <span className="muted">· {x.medicine_name} (Rx #{x.prescription_id})</span></li>)}</ul>
              </section>
            )}
          </div>
        );
      }}
    />
  );
}
