import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth";
import { List, Notice, Panel } from "../../components/ui";

const FREQUENCY = (n) => ({ 1: "once daily", 2: "twice daily", 3: "three times daily", 4: "four times daily" }[n] || `${n}× daily`);

// Pharmacy staff: find an active prescription, check stock for the whole course, then dispense it.
export default function Dispense({ pid, setFlash }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null); // prescription_id being reviewed
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return call(`/pharmacies/${pid}/prescriptions/pending${qs}`).then((r) => { setRows(r.data); setError(""); }).catch((e) => setError(e.message));
  }, [call, pid, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <Panel title="Prescriptions waiting to be dispensed">
        <input className="filter" placeholder="Search by patient name or prescription number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search prescriptions" />
        <Notice error={error} />
        {rows && <List rows={rows} empty="No prescriptions are waiting." render={(p) => (
          <>
            <strong>{p.patient_name} <span className="badge EXPIRING_SOON">Waiting</span></strong>
            <span>Rx #{p.prescription_id} · {p.prescription_date} · {p.diagnosis} · {p.doctor_name} · {p.item_count} medicine(s)</span>
            <div className="actions">
              <button className={open === p.prescription_id ? "secondary" : ""} onClick={() => setOpen(open === p.prescription_id ? null : p.prescription_id)}>{open === p.prescription_id ? "Close" : "Review and dispense"}</button>
            </div>
          </>
        )} />}
      </Panel>
      {open && <Review key={open} pid={pid} id={open} onDone={(m) => { setFlash({ success: m }); setOpen(null); load(); }} />}
    </>
  );
}

function Review({ pid, id, onDone }) {
  const { call } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => { if (data) box.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [data]);
  useEffect(() => { call(`/pharmacies/${pid}/prescriptions/${id}/stock`).then((r) => setData(r.data)).catch((e) => setError(e.message)); }, [call, pid, id]);

  async function dispense() {
    const name = data.prescription.patient_name;
    if (!window.confirm(`Dispense prescription #${id} for ${name}? Stock will be reduced and this cannot be undone.`)) return;
    setBusy(true);
    try { await call(`/pharmacies/${pid}/prescriptions/${id}/dispense`, { method: "POST", body: {} }); onDone(`Prescription #${id} for ${name} was dispensed and stock was updated.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!data) return <Panel title={`Prescription #${id}`}>{error ? <Notice error={error} /> : <p className="muted">Checking stock…</p>}</Panel>;
  const { prescription: rx, items, can_dispense: ok } = data;
  return (
    <div ref={box} style={{ scrollMarginTop: "1rem" }}>
    <Panel title={`Prescription #${id} for ${rx.patient_name}`}>
      <p className="muted">{rx.diagnosis} · written by {rx.doctor_name} on {rx.prescription_date}{rx.notes ? ` · Notes: ${rx.notes}` : ""}</p>
      <div className="detail">
        <table>
          <thead><tr><th>Medicine</th><th>How to take</th><th>Needed</th><th>In stock</th><th>Batches to use</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.prescription_item_id}>
                <td><b>{i.medicine_name}</b> {i.strength}<br /><span className="muted small">{i.generic_name}</span></td>
                <td>{i.dosage}, {FREQUENCY(i.frequency_per_day)}<br /><span className="muted small">{i.start_date} to {i.end_date} ({i.course_days} days)</span></td>
                <td>{i.required_quantity}</td>
                <td><span className={`badge ${i.is_sufficient ? "" : "EXPIRED"}`}>{i.available_stock} {i.is_sufficient ? "enough" : "not enough"}</span></td>
                <td>{i.suggested_batches.length ? i.suggested_batches.map((b) => <div key={b.batch_id} className="small">Batch {b.batch_number}: take {b.take} <span className="muted">(expires {b.expiry_date})</span></div>) : <span className="muted small">None in date</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ok && <p className="warning">There is not enough in-date stock for every medicine. Receive more stock before dispensing.</p>}
      <Notice error={error} />
      <div className="actions">
        <button disabled={!ok || busy} onClick={dispense}>{busy ? "Dispensing…" : "Dispense prescription"}</button>
      </div>
    </Panel>
    </div>
  );
}
