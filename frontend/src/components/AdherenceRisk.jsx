import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice } from "./ui";
import "./AdherenceRisk.css";

const LEVEL_TEXT = { HIGH: "High", MEDIUM: "Medium", LOW: "Low", UNKNOWN: "Not enough data" };
const FILTERS = [["ALL", "All"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"], ["UNKNOWN", "Not enough data"]];

// Doctor's view: their patients ranked by the model's estimate of poor adherence over the next 7 days. Advisory only.
export default function AdherenceRisk({ onOpen }) {
  const { call } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  useEffect(() => { call("/doctors/me/at-risk").then((r) => setD(r.data)).catch((e) => setError(e.message)); }, [call]);
  if (error) return <Notice error={error} />;
  if (!d) return <p className="muted">Loading…</p>;

  const m = d.model, met = m.metrics;
  const counts = { ALL: d.items.length, HIGH: d.summary.high, MEDIUM: d.summary.medium, LOW: d.summary.low, UNKNOWN: d.summary.unknown };
  const shown = d.items.filter((p) => filter === "ALL" || p.level === filter);

  return (
    <section className="ar">
      <header className="ar-head">
        <div>
          <h2>Adherence risk</h2>
          <p>Which of your patients are most likely to take fewer than 70% of their doses over the next 7 days.</p>
        </div>
        <span className={`ar-model ${m.source}`} title={met ? `Tested on ${met.n_test} later examples. The one-line rule “last week's adherence” scores ${met.baseline_auc}.` : "Hand-set starting weights. Train a model in the admin Analytics tab."}>
          {m.source === "trained" ? `Trained model · AUC ${met.auc}` : "Starter model · not trained yet"}
        </span>
      </header>

      <div className="ar-chips" role="tablist" aria-label="Filter by risk level">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {label}<b>{counts[k]}</b>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="muted ar-empty">{d.items.length === 0 ? "None of your patients has a current prescription yet." : "No patients in this group."}</p>
      ) : (
        <ul className="ar-list">
          {shown.map((p) => (
            <li key={p.patient_id} className={`ar-row ${p.level.toLowerCase()}`}>
              <div className="ar-main">
                <div className="ar-title">
                  <strong>{p.name}</strong>
                  <span className="ar-pill">{LEVEL_TEXT[p.level]}</span>
                </div>
                {p.risk === null ? (
                  <p className="ar-why muted">Fewer than 6 answered doses in the last 30 days, so there is nothing reliable to score yet.</p>
                ) : (
                  <>
                    <div className="ar-meter" role="img" aria-label={`Risk score ${Math.round(p.risk * 100)} out of 100`}><i style={{ width: `${Math.round(p.risk * 100)}%` }} /></div>
                    {p.reasons.length > 0 ? <ul className="ar-reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="ar-why muted">Nothing worrying in the recent pattern.</p>}
                  </>
                )}
                <p className="ar-stats">
                  {p.adherence_7 === null ? "No answered doses this week" : `Last 7 days ${p.adherence_7}%`}
                  {p.adherence_30 !== null && <> · Last 30 days {p.adherence_30}%</>}
                </p>
              </div>
              <div className="ar-side">
                {p.risk !== null && <div className="ar-score"><b>{Math.round(p.risk * 100)}</b><small>risk score</small></div>}
                <button type="button" className="secondary" onClick={() => onOpen(p)}>Open patient</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small ar-note">
        The score comes from a statistical model that looks at each patient's recent doses. It is advisory only: it never changes a prescription or a reminder,
        and it is a ranking score, not a probability. Always use clinical judgement.
      </p>
    </section>
  );
}
