import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import "./Overview.css";

// "At a glance" home screens: a row of cards per role. Every card loads on its own (a failure in one never blanks the others),
// shows a skeleton while loading, and opens the tab where the person can act on it.
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s) => new Date(String(s).replace(" ", "T").slice(0, 16));
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const shortDay = (d, locale) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

function rel(d, t, locale, now = new Date()) {
  const mins = Math.round((d - now) / 60000);
  if (mins < 1) return t("now");
  if (mins < 60) return t("in {n} min", { n: mins });
  if (ymd(d) === ymd(now)) return t("today at {time}", { time: hhmm(d) });
  if (ymd(d) === ymd(plusDays(1))) return t("tomorrow at {time}", { time: hhmm(d) });
  return t("{day} at {time}", { day: shortDay(d, locale), time: hhmm(d) });
}
const greeting = (t) => { const h = new Date().getHours(); return h < 12 ? t("Good morning") : h < 17 ? t("Good afternoon") : t("Good evening"); };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ICON = {
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  check: "M20 6L9 17l-5-5",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9a2 2 0 0 0-1.8-1.1H7.3a2 2 0 0 0-1.8 1.1z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};

// One card. value === null means "still loading".
function Glance({ tone, icon, value, label: rawLabel, hint: rawHint, onClick, attention }) {
  const { t } = useI18n();
  const label = t(rawLabel);
  const hint = rawHint ? t(rawHint) : rawHint;
  const loading = value === null;
  return (
    <button type="button" className={`glance g-${tone}${attention ? " attn" : ""}`} onClick={onClick}
      aria-label={loading ? `${label}: loading` : `${label}: ${value}${hint ? `. ${hint}` : ""}`}>
      <span className="glance-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[icon]} /></svg>
      </span>
      <span className={`glance-value${loading ? " skel" : ""}`}>{loading ? " " : value}</span>
      <span className="glance-label">{label}</span>
      <span className={`glance-hint${loading ? " skel" : ""}`}>{loading ? " " : hint}</span>
    </button>
  );
}

// Runs the loaders once (and again when `deps` change). Each result lands separately: { ok: value } | { failed: true }.
function useGlances(make, deps = []) {
  const { call } = useAuth();
  const [st, setSt] = useState({});
  useEffect(() => {
    let stale = false;
    setSt({});
    Object.entries(make(call)).forEach(([k, p]) => {
      p.then((v) => { if (!stale) setSt((s) => ({ ...s, [k]: { v } })); })
        .catch(() => { if (!stale) setSt((s) => ({ ...s, [k]: { failed: true } })); });
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, ...deps]);
  // read(key, fn) -> null while loading, "–" if it failed, else fn(value)
  const read = (k, fn, failed = "–") => (!st[k] ? null : st[k].failed ? failed : fn(st[k].v));
  const hintOf = (k, fn) => (!st[k] ? null : st[k].failed ? "Could not load" : fn(st[k].v));
  const raw = (k) => (st[k] && !st[k].failed ? st[k].v : null);
  return { read, hintOf, raw };
}

function Frame({ title, subtitle, children }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const first = (user?.name || "").replace(/^Dr\.?\s*/i, "").split(" ")[0];
  return (
    <>
      <div className="glance-hello">
        <h2>{greeting(t)}{first ? `, ${first}` : ""}</h2>
        <p className="muted">{t(subtitle)}</p>
      </div>
      <section className="glances" aria-label={t(title)}>{children}</section>
    </>
  );
}

export function PatientOverview({ go }) {
  const { t, locale } = useI18n();
  const g = useGlances((call) => ({
    due: call("/reminders/due").then((r) => r.data),
    rem: call("/patients/me/reminders").then((r) => r.data),
    appts: call("/appointments?when=upcoming&limit=20").then((r) => r.data),
    rx: call("/patients/me/prescriptions/active").then((r) => r.data),
    refill: call("/refills/eligible").then((r) => r.data),
  }));
  const now = new Date();
  const nextDose = (rem) => rem.filter((r) => r.status === "PENDING" && at(r.scheduled_at) >= now).sort((a, b) => at(a.scheduled_at) - at(b.scheduled_at))[0];
  const nextAppt = (rows) => rows.filter((a) => ["REQUESTED", "CONFIRMED"].includes(a.status) && !a.is_past).sort((a, b) => at(a.scheduled_at) - at(b.scheduled_at))[0];
  const due = g.raw("due");
  return (
    <Frame title="Your day at a glance" subtitle="Here is what needs you today.">
      <Glance tone="orange" icon="check" attention={!!due && due.length > 0} onClick={() => go("today")}
        value={g.read("due", (d) => d.length)} label="Doses to confirm" hint={g.hintOf("due", (d) => (d.length ? "Tap to answer them" : "You are all caught up"))} />
      <Glance tone="purple" icon="clock" onClick={() => go("calendar")}
        value={g.read("rem", (r) => { const d = nextDose(r); return d ? hhmm(at(d.scheduled_at)) : t("None"); })} label="Next dose"
        hint={g.hintOf("rem", (r) => { const d = nextDose(r); return d ? `${d.medicine_name} · ${rel(at(d.scheduled_at), t, locale)}` : "No upcoming doses"; })} />
      <Glance tone="blue" icon="calendar" onClick={() => go("appts")}
        value={g.read("appts", (rows) => { const a = nextAppt(rows); return a ? shortDay(at(a.scheduled_at), locale) : t("None"); })} label="Next appointment"
        hint={g.hintOf("appts", (rows) => { const a = nextAppt(rows); return a ? `${a.doctor_name} · ${a.status === "CONFIRMED" ? t("Confirmed") : t("Waiting for the doctor")}` : "Nothing booked"; })} />
      <Glance tone="yellow" icon="file" onClick={() => go("rx")}
        value={g.read("rx", (rows) => rows.length)} label="Active prescriptions" hint={g.hintOf("rx", (rows) => (rows.length ? "Tap to see the details" : "No active prescriptions"))} />
      <Glance tone="green" icon="refresh" onClick={() => go("refills")}
        value={g.read("refill", (rows) => rows.filter((p) => !p.has_open).length)} label="Ready to refill"
        hint={g.hintOf("refill", (rows) => (rows.some((p) => !p.has_open) ? "Courses ending soon" : rows.length ? "Request already sent" : "Nothing to refill right now"))} />
    </Frame>
  );
}

export function DoctorOverview({ go }) {
  const today = ymd(new Date()), weekEnd = ymd(plusDays(6));
  const g = useGlances((call) => ({
    appts: call("/appointments?when=upcoming&limit=50").then((r) => r.data),
    mine: call("/doctors/me/prescriptions").then((r) => r.data),
    sched: call(`/doctors/me/calendar?from=${today}&to=${weekEnd}`).then((r) => r.data),
    refills: call("/refills?status=REQUESTED&limit=50").then((r) => r.data),
  }), [today]);
  const live = (rows) => rows.filter((a) => ["REQUESTED", "CONFIRMED"].includes(a.status));
  const todays = (rows) => live(rows).filter((a) => a.scheduled_at.slice(0, 10) === today).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const requests = g.raw("appts") ? g.raw("appts").filter((a) => a.status === "REQUESTED").length : 0;
  return (
    <Frame title="Your practice at a glance" subtitle="Appointments, requests and prescriptions that need you.">
      <Glance tone="purple" icon="calendar" onClick={() => go("schedule")}
        value={g.read("appts", (rows) => todays(rows).length)} label="Appointments today"
        hint={g.hintOf("appts", (rows) => { const t = todays(rows).find((a) => at(a.scheduled_at) >= new Date()) || todays(rows)[0]; return t ? `Next: ${hhmm(at(t.scheduled_at))} · ${t.patient_name}` : "Nothing scheduled today"; })} />
      <Glance tone="orange" icon="inbox" attention={requests > 0} onClick={() => go("appts")}
        value={g.read("appts", (rows) => rows.filter((a) => a.status === "REQUESTED").length)} label="Requests to answer"
        hint={g.hintOf("appts", (rows) => (rows.some((a) => a.status === "REQUESTED") ? "Confirm or decline them" : "No pending requests"))} />
      <Glance tone="yellow" icon="file" onClick={() => go("mine")}
        value={g.read("mine", (rows) => rows.filter((r) => r.status === "ACTIVE").length)} label="Waiting for the pharmacy"
        hint={g.hintOf("mine", (rows) => `${plural(rows.length, "prescription")} written in total`)} />
      <Glance tone="blue" icon="users" onClick={() => go("schedule")}
        value={g.read("sched", (d) => d.followups.length)} label="Courses ending this week"
        hint={g.hintOf("sched", (d) => (d.followups.length ? "Consider a follow-up" : "No follow-ups due"))} />
      <Glance tone="green" icon="refresh" attention={!!g.raw("refills") && g.raw("refills").length > 0} onClick={() => go("refills")}
        value={g.read("refills", (rows) => rows.length)} label="Refill requests"
        hint={g.hintOf("refills", (rows) => (rows.length ? "Approve or decline them" : "No refill requests"))} />
    </Frame>
  );
}

export function PharmacyOverview({ pid, go }) {
  const g = useGlances((call) => ({
    pending: call(`/pharmacies/${pid}/prescriptions/pending`).then((r) => r.data),
    low: call(`/pharmacies/${pid}/low-stock`).then((r) => r.data),
    inv: call(`/pharmacies/${pid}/inventory?limit=1`).then((r) => r.meta.summary),
  }), [pid]);
  const pending = g.raw("pending"), low = g.raw("low"), inv = g.raw("inv");
  return (
    <Frame title="Your pharmacy at a glance" subtitle="Prescriptions to dispense and stock that needs attention.">
      <Glance tone="orange" icon="file" attention={!!pending && pending.length > 0} onClick={() => go("dispense")}
        value={g.read("pending", (rows) => rows.length)} label="Waiting to dispense"
        hint={g.hintOf("pending", (rows) => (rows.length ? "Tap to review and dispense" : "Nothing waiting"))} />
      <Glance tone="red" icon="alert" attention={!!low && low.length > 0} onClick={() => go("alerts")}
        value={g.read("low", (rows) => rows.length)} label="Low stock"
        hint={g.hintOf("low", (rows) => (rows.length ? rows.slice(0, 2).map((m) => m.name).join(", ") + (rows.length > 2 ? "…" : "") : "Everything is above its reorder level"))} />
      <Glance tone="yellow" icon="clock" onClick={() => go("calendar")}
        value={g.read("inv", (s) => s.expiring_soon)} label="Batches expiring soon" hint={g.hintOf("inv", () => "See them in the expiry calendar")} />
      <Glance tone="purple" icon="box" attention={!!inv && inv.expired > 0} onClick={() => go("inventory")}
        value={g.read("inv", (s) => s.expired)} label="Expired batches" hint={g.hintOf("inv", (s) => (s.expired ? "Remove them from the inventory" : `${plural(s.batches, "batch", "batches")} in stock`))} />
    </Frame>
  );
}
