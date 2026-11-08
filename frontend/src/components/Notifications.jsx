import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { Notice } from "./ui";

// The backend does not track "read", so unread = newer than the last time this person opened the list in this browser.
const seenKey = (userId) => `medsync-notif-seen-${userId}`;
const readSeen = (userId) => { try { return Number(localStorage.getItem(seenKey(userId))) || 0; } catch { return 0; } };
const markSeen = (userId) => { try { localStorage.setItem(seenKey(userId), String(Date.now())); } catch { /* storage may be blocked */ } window.dispatchEvent(new Event("medsync-notif-seen")); };
const when = (s) => new Date(String(s).replace(" ", "T"));
const CHANNEL = { EMAIL: "Email", SMS: "SMS", PUSH: "Push", IN_APP: "In-app" };
const STATUS = { SENT: "Sent", QUEUED: "Queued", FAILED: "Failed" };

function useNotifications(limit) {
  const { call, user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(() => readSeen(user.user_id));
  const load = useCallback(() => call(`/patients/me/notifications?limit=${limit}`).then((r) => { setRows(r.data); setError(""); }).catch((e) => setError(e.message)), [call, limit]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sync = () => setSeen(readSeen(user.user_id));
    window.addEventListener("medsync-notif-seen", sync);
    return () => window.removeEventListener("medsync-notif-seen", sync);
  }, [user.user_id]);
  const unread = rows ? rows.filter((n) => when(n.sent_at).getTime() > seen).length : 0;
  return { rows, error, unread, seen, reload: load };
}

function Item({ n, fresh }) {
  return (
    <div className={`row notif${fresh ? " fresh" : ""}`}>
      <strong>{n.title} <span className="badge DISPENSED">{CHANNEL[n.channel] || n.channel}</span> <span className={`badge ${n.status === "FAILED" ? "EXPIRED" : n.status === "QUEUED" ? "EXPIRING_SOON" : ""}`}>{STATUS[n.status] || n.status}</span></strong>
      <span>{n.message}</span>
      <span className="small">{when(n.sent_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

// Bell in the top bar: a dot when something is new, and a short dropdown of the latest messages.
export function NotificationBell({ onViewAll }) {
  const { user } = useAuth();
  const { rows, unread, seen, reload } = useNotifications(5);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const toggle = () => { if (!open) reload(); else markSeen(user.user_id); setOpen(!open); };
  return (
    <div className="bell" ref={box}>
      <button type="button" className="theme-round" onClick={toggle} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={open} title="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {unread > 0 && <i className="bell-dot" aria-hidden="true">{unread > 9 ? "9+" : unread}</i>}
      </button>
      {open && (
        <div className="bell-menu card" role="dialog" aria-label="Latest notifications">
          <h3>Notifications</h3>
          {!rows || !rows.length ? <p className="muted small">No notifications yet.</p> : rows.map((n) => (
            <div className="bell-item" key={n.notification_id}>
              <strong>{n.title}</strong>
              <span>{n.message}</span>
              <small>{when(n.sent_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{when(n.sent_at).getTime() > seen ? " · new" : ""}</small>
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => { markSeen(user.user_id); setOpen(false); onViewAll(); }}>View all</button>
        </div>
      )}
    </div>
  );
}

// Full list for the Notifications tab. Opening it counts everything as seen.
export function NotificationList() {
  const { user } = useAuth();
  const { rows, error, seen } = useNotifications(50);
  const first = useRef(seen);
  useEffect(() => { if (rows) markSeen(user.user_id); }, [rows, user.user_id]);
  return (
    <section className="card panel">
      <h2>Notifications</h2>
      <Notice error={error} />
      {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No notifications yet. Dose reminders will appear here.</p> : (
        <div className="list">{rows.map((n) => <Item key={n.notification_id} n={n} fresh={when(n.sent_at).getTime() > first.current} />)}</div>
      )}
    </section>
  );
}
