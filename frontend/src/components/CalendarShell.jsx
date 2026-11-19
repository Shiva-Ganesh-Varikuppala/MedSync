import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "./ui";
import "./CareCalendar.css";
import "./CalendarShell.css";

// Month/week calendar frame shared by the doctor schedule and the pharmacy expiry calendar.
// The caller says where to fetch from and how to draw one day:
//   path    "/doctors/me/calendar" (gets ?from=&to= added)
//   legend  [[cssClass, label], ...]
//   cell    (data, key) -> { label, marks, lines }   marks = month view, lines = week view, label = screen-reader text
//   detail  (data, key, { reload, now, setError }) -> JSX for the selected day
const pad = (n) => String(n).padStart(2, "0");
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function rangeFor(view, cursor) {
  if (view === "week") { const start = mondayOf(cursor); return { start, end: addDays(start, 6) }; }
  const start = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return { start, end: addDays(start, 41) };
}

function titleFor(view, cursor, range) {
  if (view === "month") return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const f = (d, y) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) });
  return `${f(range.start)} – ${f(range.end, true)}`;
}

export default function CalendarShell({ title, path, legend, cell, detail, empty = "Nothing scheduled for this day.", hasItems }) {
  const { call } = useAuth();
  const today = keyOf(new Date());
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const range = rangeFor(view, cursor);
  const from = keyOf(range.start), to = keyOf(range.end);

  const load = useCallback(async () => {
    const n = ++latest.current; // ignore an older answer that arrives after a newer request
    try {
      const r = await call(`${path}?from=${from}&to=${to}`);
      if (n === latest.current) { setData(r.data); setError(""); }
    } catch (e) { if (n === latest.current) setError(e.message); }
  }, [call, path, from, to]);
  useEffect(() => { load(); }, [load]);

  const step = (dir) => setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1) : addDays(cursor, 7 * dir));
  const goToday = () => { setCursor(new Date()); setSelected(today); };
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => addDays(range.start, i));

  return (
    <>
      <Panel title={title}>
        <div className="cal-bar">
          <div className="cal-nav">
            <button className="secondary" onClick={() => step(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>‹</button>
            <button className="secondary" onClick={goToday}>Today</button>
            <button className="secondary" onClick={() => step(1)} aria-label={view === "month" ? "Next month" : "Next week"}>›</button>
          </div>
          <h3 className="cal-title" aria-live="polite">{titleFor(view, cursor, range)}</h3>
          <div className="cal-nav" role="group" aria-label="Calendar view">
            <button className={view === "month" ? "" : "secondary"} onClick={() => setView("month")}>Month</button>
            <button className={view === "week" ? "" : "secondary"} onClick={() => setView("week")}>Week</button>
          </div>
        </div>
        <Notice error={error} />
        <ul className="cal-legend" aria-label="Legend">{legend.map(([c, l]) => <li key={c}><i className={`cdot ${c}`} /> {l}</li>)}</ul>
        <div className={`cal-grid ${view}`} role="grid" aria-label={title}>
          {WEEKDAYS.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}
          {days.map((d) => {
            const k = keyOf(d);
            const c = data ? cell(data, k) : { label: "", marks: null, lines: null };
            const out = view === "month" && d.getMonth() !== cursor.getMonth();
            const cls = ["cal-cell", out ? "out" : "", k === today ? "today" : "", k === selected ? "selected" : ""].join(" ").trim();
            const label = `${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${c.label ? `: ${c.label}` : ""}`;
            return (
              <button key={k} role="gridcell" className={cls} onClick={() => setSelected(k)} aria-label={label} aria-pressed={k === selected}>
                <span className="cal-num">{d.getDate()}</span>
                {view === "month" ? <span className="cal-marks">{c.marks}</span> : <span className="cal-lines">{c.lines}</span>}
              </button>
            );
          })}
        </div>
        {!data && !error && <p className="muted">Loading…</p>}
      </Panel>

      <Panel title={parse(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
        {data && hasItems && !hasItems(data, selected) ? <p className="muted">{empty}</p> : data ? detail(data, selected, { reload: load, now: new Date(), setError }) : null}
      </Panel>
    </>
  );
}
