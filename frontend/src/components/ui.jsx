import React, { useEffect } from "react";

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

// Prescription status as plain words.
export const rxStatus = (s) => ({ ACTIVE: "Active", DISPENSED: "Dispensed", CANCELLED: "Cancelled" }[s] || s);

// Lets the top-bar search open a tab of the current screen: useGoto(setTab).
export function useGoto(setTab) {
  useEffect(() => {
    const on = (e) => setTab(e.detail.tab);
    window.addEventListener("medsync-goto", on);
    return () => window.removeEventListener("medsync-goto", on);
  }, [setTab]);
}

// Row of big gradient summary tiles: items = [[value, label, "purple" | "orange" | "yellow" | "red"], ...]
export function Tiles({ items }) {
  return (
    <section className="tiles" style={{ "--n": items.length }}>
      {items.map(([value, label, color]) => (
        <div className={`tile tile-${color}`} key={label}><p className="tile-value">{value}</p><p className="tile-label">{label}</p></div>
      ))}
    </section>
  );
}
