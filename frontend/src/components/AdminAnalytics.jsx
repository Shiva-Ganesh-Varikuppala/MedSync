import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "./ui";
import { AreaChart, Donut } from "./Charts";
import "./AdminAnalytics.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// Numbers computed in the database (SQL views) and drawn here. Read-only.
// Layout: one row of key figures, two charts, two short lists. No decoration beyond hairlines and one accent colour.
export default function AdminAnalytics() {
  const { call } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { call("/admin/analytics").then((r) => setD(r.data)).catch((e) => setError(e.message)); }, [call]);
  if (error) return <Notice error={error} />;
  if (!d) return <p className="muted">Loading…</p>;

  const rem = d.reminders;
  const kpis = [
    { label: "On-time adherence", value: d.overall_adherence_pct === null ? "–" : `${d.overall_adherence_pct}%`, note: "of answered reminders" },
    { label: "Reminders", value: sum(rem), note: "created in total" },
    { label: "Appointments", value: sum(d.appointments), note: "recorded" },
    { label: "Stored files", value: d.files.count, note: sizeText(d.files.bytes) },
  ];

  return (
    <section className="am">
      <header className="am-head">
        <div>
          <h2>Analytics</h2>
          <p>Reminders, prescriptions, stock and adherence across MedSync.</p>
        </div>
        <span className="am-live"><i aria-hidden="true" />Live</span>
      </header>

      <dl className="am-kpis">
        {kpis.map((k) => (
          <div className="am-kpi" key={k.label}>
            <dt>{k.label}</dt>
            <dd>{k.value}</dd>
            <small>{k.note}</small>
          </div>
        ))}
      </dl>

      <div className="am-grid">
        <Panel title="Prescriptions per month">
          <AreaChart data={d.prescriptions_by_month.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.count }))} />
        </Panel>
        <Panel title="Reminder outcomes">
          <Donut center={sum(rem)} caption="reminders" parts={[
            { label: "Taken", value: rem.TAKEN || 0, color: "#2fb67c" },
            { label: "Skipped", value: rem.SKIPPED || 0, color: "#f0b429" },
            { label: "Missed", value: rem.MISSED || 0, color: "#e5484d" },
            { label: "Pending", value: rem.PENDING || 0, color: "#9aa0b4" }]} />
        </Panel>
      </div>

      <div className="am-grid">
        <Panel title="Lowest stock">
          {d.low_stock.length === 0 ? <p className="muted am-empty">No stock recorded.</p> : (
            <ul className="am-list">
              {d.low_stock.map((s, i) => (
                <li key={i}>
                  <div><strong>{s.medicine_name}</strong><span>{s.pharmacy_name} · expires {String(s.nearest_expiry).slice(0, 10)}</span></div>
                  <b>{s.units_in_stock}<small> units</small></b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Adherence by patient">
          {d.adherence.length === 0 ? <p className="muted am-empty">No reminders yet.</p> : (
            <ul className="am-list">
              {d.adherence.map((a, i) => (
                <li key={i}>
                  <div>
                    <strong>{a.patient_name}</strong>
                    <span>{a.taken} taken · {a.skipped} skipped · {a.missed} missed · {a.pending} pending</span>
                    <span className="am-bar" aria-hidden="true"><i style={{ width: `${a.adherence_pct ?? 0}%` }} /></span>
                  </div>
                  <b>{a.adherence_pct === null ? "–" : `${a.adherence_pct}%`}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="muted small am-note">Files are kept in {d.files.storage.driver === "azure-blob" ? `Azure Blob Storage (container ${d.files.storage.container})` : "a local folder (Azure Blob Storage is not configured)"}.</p>
    </section>
  );
}
