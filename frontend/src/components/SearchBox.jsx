import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

const KIND = { medicine: "Medicine", prescription: "Prescription", appointment: "Appointment", patient: "Patient", batch: "Stock", user: "User" };

// One box in the top bar. Results are already limited to what this role may see (the server decides).
export default function SearchBox({ onPick }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const latest = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGroups(null); setError(""); return undefined; }
    const id = ++latest.current;
    const timer = setTimeout(() => {
      call(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => { if (id === latest.current) { setGroups(r.data); setError(""); } })
        .catch((e) => { if (id === latest.current) setError(e.message); });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, call]);

  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  useEffect(() => {
    const shortcut = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); box.current?.querySelector("input")?.focus(); } };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const pick = (item) => { if (item.tab) onPick(item.tab); setOpen(false); };
  const show = open && q.trim().length >= 2;
  return (
    <div className="searchbox" ref={box}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      <input type="search" aria-label="Search" placeholder="Search…" value={q} maxLength={100}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      {q && <button className="search-clear" aria-label="Clear search" onClick={() => { setQ(""); setGroups(null); }}>×</button>}
      {show && (
        <div className="search-pop" role="listbox">
          {error && <p className="error">{error}</p>}
          {!error && groups && groups.length === 0 && <p className="muted">Nothing found for "{q.trim()}".</p>}
          {!error && !groups && <p className="muted">Searching…</p>}
          {groups && groups.map((g) => (
            <div key={g.group}>
              <p className="search-group">{g.group}</p>
              {g.items.map((i) => (
                <button key={`${i.type}-${i.id}`} className="search-item" role="option" onClick={() => pick(i)} disabled={!i.tab}>
                  <strong>{i.title}</strong>
                  <span>{KIND[i.type]} · {i.subtitle}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
