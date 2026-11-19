import React from "react";
import CalendarShell from "./CalendarShell";

// Which batches expire on which day. Red = already expired, amber = within 30 days, green = further out.
const SOON_DAYS = 30;
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const level = (today, expiry) => (expiry < today ? "expired" : expiry <= addDays(today, SOON_DAYS) ? "soon" : "ok");
const TEXT = { expired: "Expired", soon: "Expiring soon", ok: "In date" };

export default function StockCalendar({ pid }) {
  const on = (data, k) => data.batches.filter((b) => b.expiry_date === k);
  return (
    <CalendarShell
      title="Stock expiry calendar"
      path={`/pharmacies/${pid}/stock-calendar`}
      legend={[["expired", "Expired"], ["soon", `Within ${SOON_DAYS} days`], ["ok", "Later"]]}
      empty="No batches expire on this day."
      hasItems={(data, k) => on(data, k).length > 0}
      cell={(data, k) => {
        const list = on(data, k), lv = level(data.today, k);
        return {
          label: `${list.length} batch${list.length === 1 ? "" : "es"} expiring`,
          marks: list.length > 0 && <span className="cmark"><i className={`cdot ${lv}`} />{list.length}</span>,
          lines: list.map((b) => <span key={b.batch_id} className={`cline ${lv}`}>{b.medicine_name} ({b.quantity})</span>),
        };
      }}
      detail={(data, k) => {
        const lv = level(data.today, k);
        return (
          <ul className="cal-list">
            {on(data, k).map((b) => (
              <li key={b.batch_id}>
                <b>{b.medicine_name}</b> {b.strength} <span className="muted">· batch {b.batch_number} · {b.quantity} units</span> <span className={`cpill ${lv}`}>{TEXT[lv]}</span>
              </li>
            ))}
          </ul>
        );
      }}
    />
  );
}
