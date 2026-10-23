import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";

// Type-ahead medicine search. Calls onPick(medicine) when one is chosen.
export default function MedicinePicker({ onPick, disabled }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    let stale = false;
    const timer = setTimeout(() => {
      call(`/medicines/search?q=${encodeURIComponent(term)}`)
        .then((r) => { if (!stale) { setResults(r.data); setError(""); } })
        .catch((e) => { if (!stale) setError(e.message); });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [q, call]);

  return (
    <div className="picker">
      <input placeholder="Search medicine by name (2+ letters)" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} aria-label="Search medicine" />
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <ul className="picker-results">
          {results.map((m) => (
            <li key={m.medicine_id}>
              <button type="button" className="link" onClick={() => { onPick(m); setQ(""); setResults([]); }}>
                {m.name} {m.strength} <span className="muted small">{m.generic_name} · {m.dosage_form}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
