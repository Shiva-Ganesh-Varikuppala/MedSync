import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "./ui";
import { downloadFile } from "./download";
import "./AuditLog.css";

const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Admin" };
const pretty = (s) => String(s || "").toLowerCase().replace(/_/g, " ");
const when = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString(); };
const iso = (d) => d.toISOString().slice(0, 10);

// Admin-only: search and filter who did what. The free-text details are never sent by the server.
export default function AuditLog() {
  const { call } = useAuth();
  const [facets, setFacets] = useState({ actions: [], entity_types: [] });
  const [f, setF] = useState({ q: "", action: "", entity_type: "", from: "", to: "" });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  useEffect(() => { call("/admin/audit/facets").then((r) => setFacets(r.data)).catch(() => {}); }, [call]);

  const query = useCallback((p) => {
    const x = new URLSearchParams({ page: p, limit: 50 });
    for (const [k, v] of Object.entries(f)) if (v.trim()) x.set(k, v.trim());
    return x;
  }, [f]);

  // Reload from page 1 whenever a filter changes (search text is debounced). The newest request wins.
  useEffect(() => {
    let current = true;
    setLoading(true);
    const t = setTimeout(() => {
      call(`/admin/audit?${query(1)}`)
        .then((r) => { if (!current) return; setRows(r.data.items); setMore(r.data.has_more); setPage(1); setError(""); })
        .catch((e) => { if (current) setError(e.message); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(t); };
  }, [call, query]);

  async function loadMore() {
    try { const r = await call(`/admin/audit?${query(page + 1)}`); setRows((cur) => cur.concat(r.data.items)); setMore(r.data.has_more); setPage(page + 1); }
    catch (e) { setError(e.message); }
  }

  // The CSV export covers a date range; it uses the From/To above, or the last 30 days when they are empty.
  async function exportCsv() {
    const to = f.to || iso(new Date());
    const from = f.from || iso(new Date(Date.now() - 30 * 86400000));
    setBusy(true); setNote({});
    try { await downloadFile(call, `/export/admin/audit?from=${from}&to=${to}`, `medsync-audit-${from}_to_${to}.csv`); setNote({ success: `Download started (${from} to ${to}).` }); }
    catch (e) { setNote({ error: e.message }); } finally { setBusy(false); }
  }

  const filtered = Object.values(f).some((v) => v.trim());
  return (
    <Panel title="Audit log">
      <p className="muted">Who did what and when, newest first. Free-text details are not shown because they can contain clinical wording.</p>
      <div className="audit-filters">
        <input className="filter" placeholder="Search name, email or IP" value={f.q} onChange={set("q")} aria-label="Search the audit log" />
        <select value={f.action} onChange={set("action")} aria-label="Filter by action">
          <option value="">All actions</option>
          {facets.actions.map((a) => <option key={a} value={a}>{pretty(a)}</option>)}
        </select>
        <select value={f.entity_type} onChange={set("entity_type")} aria-label="Filter by record type">
          <option value="">All record types</option>
          {facets.entity_types.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label>From<input type="date" value={f.from} max={f.to || undefined} onChange={set("from")} /></label>
        <label>To<input type="date" value={f.to} min={f.from || undefined} onChange={set("to")} /></label>
      </div>
      <div className="actions">
        {filtered && <button className="secondary small" onClick={() => setF({ q: "", action: "", entity_type: "", from: "", to: "" })}>Clear filters</button>}
        <button className="secondary small" disabled={busy} onClick={exportCsv}>{busy ? "Preparing…" : "Download CSV"}</button>
      </div>
      <Notice error={error} />
      <Notice {...note} />
      {loading && !rows.length ? <p className="muted">Loading…</p> : !rows.length ? <p className="muted">No entries match.</p> : (
        <div className="audit-wrap">
          <table className="audit-table">
            <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Record</th><th>IP address</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.audit_id}>
                  <td data-label="Time">{when(r.created_at)}</td>
                  <td data-label="Who">{r.user_id ? <>{r.user_name || `User #${r.user_id}`}{r.user_role && <span className="badge">{ROLE_TEXT[r.user_role] || r.user_role}</span>}<small>{r.user_email}</small></> : <span className="muted">Anonymous or deleted user</span>}</td>
                  <td data-label="Action"><span className="audit-action">{pretty(r.action)}</span></td>
                  <td data-label="Record">{r.entity_type ? `${r.entity_type}${r.entity_id ? ` #${r.entity_id}` : ""}` : "–"}</td>
                  <td data-label="IP address">{r.ip_address || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && <button className="secondary" onClick={loadMore}>Load more</button>}
    </Panel>
  );
}
