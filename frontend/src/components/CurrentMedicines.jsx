import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

// What the patient is taking right now, from every doctor (doctor screens only).
// Shows medicine, dose, dates and who prescribed it; never another doctor's diagnosis or notes.
export default function CurrentMedicines({ patientId }) {
  const { call } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setRows(null); setError("");
    call(`/doctors/patients/${patientId}/current-medicines`).then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, [patientId, call]);
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Loading current medicines…</p>;
  return (
    <List rows={rows} compact empty="Not taking any medicines right now." render={(m) => (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <strong>💊 {m.medicine_name}</strong>
          <span className={`badge ${m.prescribed_by_me ? "DISPENSED" : ""}`}>{m.prescribed_by_me ? "Prescribed by you" : `Dr. ${m.doctor_name}`}</span>
        </div>
        <span className="muted small">{m.dosage} · {m.frequency} · {m.start_date > today() ? `starts ${m.start_date}, ` : ""}until {m.end_date}</span>
      </>
    )} />
  );
}
