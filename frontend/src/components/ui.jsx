import React from "react";

export function Notice({ error, success }) {
  if (error) return <p className="error" role="alert">{error}</p>;
  if (success) return <p className="success" role="status">{success}</p>;
  return null;
}

export function Panel({ title, children }) {
  return <section className="card panel"><h2>{title}</h2>{children}</section>;
}

export function List({ rows, render, empty = "Nothing to show yet." }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <div className="list">{rows.map((r, i) => <div className="row" key={r.prescription_id || r.reminder_id || r.patient_id || r.batch_id || r.medicine_id || i}>{render(r)}</div>)}</div>;
}

export function Field({ label, children }) {
  return <label>{label}{children}</label>;
}
