import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import PrintPrescription from "./PrintPrescription";

// Loads and shows one prescription with its medicines. Shared by doctor, patient, and pharmacy screens.
export default function PrescriptionDetail({ id, onCancel }) {
  const { call } = useAuth();
  const [rx, setRx] = useState(null);
  const [error, setError] = useState("");
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    call(`/prescriptions/${id}`).then((r) => setRx(r.data)).catch((e) => setError(e.message));
  }, [id, call]);

  if (error) return <p className="error">{error}</p>;
  if (!rx) return <p className="muted">Loading…</p>;

  return (
    <div className="detail">
      {rx.status === "DISPENSED" && (
        <p className="success"><b>Dispensed:</b> Fulfilled on {rx.dispensed_at?.slice(0, 10)} at {rx.dispensed_pharmacy_name || "Pharmacy"}</p>
      )}
      {rx.status === "CANCELLED" && (
        <p className="error"><b>Status:</b> This prescription was cancelled</p>
      )}
      {rx.notes && <p><b>Notes:</b> {rx.notes}</p>}
      <table>
        <thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>From</th><th>To</th></tr></thead>
        <tbody>{rx.items.map((i) => (
          <tr key={i.prescription_item_id}><td>{i.medicine_name}</td><td>{i.dosage}</td><td>{i.frequency}</td><td>{i.start_date}</td><td>{i.end_date}</td></tr>
        ))}</tbody>
      </table>
      {rx.dispensed_items?.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <b>Batches dispensed:</b>
          <ul style={{ margin: "0.3rem 0 0.8rem", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
            {rx.dispensed_items.map((d) => (
              <li key={d.dispensed_item_id}>Batch {d.batch_number} · {d.quantity} unit(s) · expires {d.expiry_date}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions" style={{ marginTop: "0.6rem" }}>
        <button className="secondary" onClick={() => setShowPrint(true)}>🖨️ Official Prescription Slip</button>
        {onCancel && rx.status === "ACTIVE" && <button className="secondary" onClick={() => onCancel(rx)}>Cancel prescription</button>}
      </div>

      {showPrint && <PrintPrescription rx={rx} onClose={() => setShowPrint(false)} />}
    </div>
  );
}
