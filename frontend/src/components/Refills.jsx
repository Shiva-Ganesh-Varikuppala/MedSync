import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "./ui";
import { confirmDialog, promptDialog } from "./Dialog";

// Refill requests. The patient asks for a renewal of a finished (or nearly finished) course; the prescribing doctor approves
// (a new prescription with the same medicines is created, starting today) or declines with a reason.
const WORDS = { REQUESTED: "Waiting for the doctor", APPROVED: "Approved", DECLINED: "Declined", CANCELLED: "Cancelled" };
const Badge = ({ s }) => <span className={`badge ${s}`}>{WORDS[s]}</span>;

function useRefills(query) {
  const { call } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => call(`/refills?limit=50${query}`).then((r) => { setRows(r.data); setError(""); }).catch((e) => setError(e.message)), [call, query]);
  useEffect(() => { load(); }, [load]);
  return { rows, error, setError, load };
}

export function PatientRefills() {
  const { call } = useAuth();
  const mine = useRefills("");
  const [eligible, setEligible] = useState(null);
  const [ok, setOk] = useState("");
  const [error, setError] = useState("");
  const loadEligible = useCallback(() => call("/refills/eligible").then((r) => setEligible(r.data)).catch((e) => setError(e.message)), [call]);
  useEffect(() => { loadEligible(); }, [loadEligible]);
  const refresh = () => { loadEligible(); mine.load(); };

  async function ask(p) {
    const note = await promptDialog({
      title: "Request a refill", message: [`${p.medicines}`, `Prescribed by ${p.doctor_name}. If approved, a new prescription with the same medicines starts today.`],
      label: "Note for the doctor (optional)", multiline: true, required: false, confirmLabel: "Send request",
    });
    if (note === null) return;
    setError(""); setOk("");
    try { await call("/refills", { method: "POST", body: { prescription_id: p.prescription_id, note: note || undefined } }); setOk("Refill requested. You will be notified when the doctor answers."); refresh(); }
    catch (e) { setError(e.message); }
  }
  async function cancel(r) {
    if (!(await confirmDialog({ title: "Cancel this refill request?", message: `For ${r.medicines}.`, confirmLabel: "Cancel request", cancelLabel: "Keep it", danger: true }))) return;
    setError(""); setOk("");
    try { await call(`/refills/${r.refill_id}/cancel`, { method: "POST" }); setOk("Refill request cancelled."); refresh(); }
    catch (e) { setError(e.message); }
  }

  return (
    <>
      <Panel title="Request a refill">
        <p className="muted small">You can ask for a refill in the last 7 days of a course, and up to 30 days after it ended.</p>
        <Notice error={error || mine.error} success={ok} />
        {eligible && <List rows={eligible} empty="None of your prescriptions can be refilled right now." render={(p) => (
          <>
            <strong>{p.medicines}</strong>
            <span>{p.diagnosis} · {p.doctor_name} · course {p.last_end_date >= new Date().toLocaleDateString("en-CA") ? "ends" : "ended"} {p.last_end_date}</span>
            <div className="actions">
              {p.has_open ? <span className="badge REQUESTED">Request already sent</span> : <button onClick={() => ask(p)}>Request refill</button>}
            </div>
          </>
        )} />}
      </Panel>
      <Panel title="My refill requests">
        {mine.rows && <List rows={mine.rows} empty="You have not asked for any refills yet." render={(r) => (
          <>
            <strong>{r.medicines} <Badge s={r.status} /></strong>
            <span>{r.doctor_name} · asked {r.requested_at}{r.note ? ` · “${r.note}”` : ""}</span>
            {r.doctor_note && <span>Doctor's note: {r.doctor_note}</span>}
            {r.status === "APPROVED" && r.new_prescription_id && <span>New prescription #{r.new_prescription_id} was created. Find it under My prescriptions.</span>}
            {r.status === "REQUESTED" && <div className="actions"><button className="danger-soft" onClick={() => cancel(r)}>Cancel request</button></div>}
          </>
        )} />}
      </Panel>
    </>
  );
}

export function DoctorRefills() {
  const { call } = useAuth();
  const [when, setWhen] = useState("open");
  const { rows, error, setError, load } = useRefills(when === "open" ? "&status=REQUESTED" : "");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(0);

  async function approve(r) {
    if (!(await confirmDialog({
      title: `Approve ${r.patient_name}'s refill?`,
      message: [r.medicines, "A new prescription with the same medicines and course length is created, starting today. Interactions are checked again."],
      confirmLabel: "Approve and create prescription",
    }))) return;
    setBusy(r.refill_id); setError(""); setOk("");
    const send = (body) => call(`/refills/${r.refill_id}/approve`, { method: "POST", body });
    try {
      let res;
      try { res = await send({}); }
      catch (e) {
        if (!/^Severe interaction/.test(e.message)) throw e;
        // The server found a severe interaction: it needs a written reason, exactly as when prescribing by hand.
        const reason = await promptDialog({ title: "Severe interaction", message: e.message, label: "Reason for prescribing anyway", multiline: true, minLength: 10, confirmLabel: "Approve anyway", danger: true });
        if (!reason) throw new Error("Not approved: no reason given.");
        res = await send({ interaction_override_reason: reason });
      }
      setOk(`Approved. Prescription #${res.data.new_prescription_id} was created for ${r.patient_name}.`); load();
    } catch (e) { setError(e.message); } finally { setBusy(0); }
  }
  async function decline(r) {
    const note = await promptDialog({ title: `Decline ${r.patient_name}'s refill?`, message: "The patient will see your reason.", label: "Reason", multiline: true, minLength: 3, confirmLabel: "Decline request", danger: true });
    if (!note) return;
    setBusy(r.refill_id); setError(""); setOk("");
    try { await call(`/refills/${r.refill_id}/decline`, { method: "POST", body: { note } }); setOk("Refill declined."); load(); }
    catch (e) { setError(e.message); } finally { setBusy(0); }
  }

  return (
    <Panel title="Refill requests">
      <nav className="tabs" role="tablist">
        {[["open", "To answer"], ["all", "All"]].map(([k, l]) => <button key={k} role="tab" aria-selected={when === k} className={when === k ? "" : "secondary"} onClick={() => setWhen(k)}>{l}</button>)}
      </nav>
      <Notice error={error} success={ok} />
      {rows && <List rows={rows} empty={when === "open" ? "No refill requests are waiting." : "No refill requests yet."} render={(r) => (
        <>
          <strong>{r.patient_name} <Badge s={r.status} /></strong>
          <span>{r.medicines} · prescription #{r.prescription_id} · asked {r.requested_at}</span>
          {r.note && <span>Patient's note: {r.note}</span>}
          {r.doctor_note && <span>Your note: {r.doctor_note}</span>}
          {r.status === "APPROVED" && r.new_prescription_id && <span>New prescription #{r.new_prescription_id}</span>}
          {r.status === "REQUESTED" && (
            <div className="actions">
              <button disabled={busy === r.refill_id} onClick={() => approve(r)}>Approve</button>
              <button className="danger-soft" disabled={busy === r.refill_id} onClick={() => decline(r)}>Decline</button>
            </div>
          )}
        </>
      )} />}
    </Panel>
  );
}
