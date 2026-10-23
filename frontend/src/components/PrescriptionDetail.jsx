import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";

// Loads and shows one prescription with its medicines. Shared by doctor and patient screens.
export default function PrescriptionDetail({ id, onCancel }) {
  const { call } = useAuth();
  const [rx, setRx] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { call(`/prescriptions/${id}`).then((r) => setRx(r.data)).catch((e) => setError(e.message)); }, [id, call]);
  if (error) return <p className="error">{error}</p>;
  if (!rx) return <p className="muted">Loading…</p>;
  return (
    <div className="detail">
      {rx.notes && <p><b>Notes:</b> {rx.notes}</p>}
      <table>
        <thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>From</th><th>To</th></tr></thead>
        <tbody>{rx.items.map((i) => (
          <tr key={i.prescription_item_id}><td>{i.medicine_name}</td><td>{i.dosage}</td><td>{i.frequency}</td><td>{i.start_date}</td><td>{i.end_date}</td></tr>
        ))}</tbody>
      </table>
      {onCancel && rx.status === "ACTIVE" && <button className="secondary" onClick={() => onCancel(rx)}>Cancel prescription</button>}
    </div>
  );
}
