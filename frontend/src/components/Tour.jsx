import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import "./Tour.css";

// First-sign-in walkthrough. Each step points at a part of the screen (found with a CSS selector) and explains it.
// Seen-state is kept per account in localStorage; "Take a tour" in the sidebar fires the "medsync:tour" event to replay it.

const SECTIONS = {
  DOCTOR: "Patients, new prescriptions, refills, appointments and your schedule are all here.",
  PATIENT: "Today's doses, your calendar, prescriptions, refills, appointments and notifications are all here.",
  PHARMACY_STAFF: "Inventory, dispensing, stock alerts and the medicine catalog are all here.",
  ADMIN: "Accounts, analytics, reports, the audit log and automation are all here.",
};

const stepsFor = (role) => [
  { title: "Welcome to MedSync", text: "A quick tour of where things are. It takes about half a minute and you can skip it at any time." },
  { target: "#side-tabs", title: "Your sections", text: SECTIONS[role] || "Everything you can do is listed here." },
  { target: 'nav[aria-label="Main"]', title: "Your account", text: "Open your profile, change your password, replay this tour or sign out from here." },
  { target: ".searchbox", title: "Search", text: "Jump to a screen or find a record from anywhere." },
  { target: ".lang-select", title: "Language and theme", text: "Switch between English, Hindi and Telugu, and between light and dark mode." },
  { title: "You are all set", text: "You can reopen this tour any time with “Take a tour” in the sidebar." },
];

const keyFor = (user) => `medsync-tour-${user.user_id}`;
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: the tour just shows again next time */ } };

export default function Tour() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  const steps = stepsFor(role);
  const step = steps[i];

  // Opens by itself once per account, a moment after the screen has settled.
  useEffect(() => {
    if (!user || read(keyFor(user))) return undefined;
    const timer = setTimeout(() => { setI(0); setOpen(true); }, 700);
    return () => clearTimeout(timer);
  }, [user]);

  // "Take a tour" replays it.
  useEffect(() => {
    const replay = () => { setI(0); setOpen(true); };
    window.addEventListener("medsync:tour", replay);
    return () => window.removeEventListener("medsync:tour", replay);
  }, []);

  const close = useCallback(() => { setOpen(false); if (user) write(keyFor(user), "done"); }, [user]);

  // Finds the highlighted element and keeps its box up to date.
  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      const r = el ? el.getBoundingClientRect() : null;
      setRect(r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    const el = step.target ? document.querySelector(step.target) : null;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, step]);

  useEffect(() => { if (open && cardRef.current) cardRef.current.focus(); }, [open, i]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !user) return null;

  // Card position on wide screens: beside a sidebar item, below anything else; centred when there is nothing to point at.
  // On narrow screens CSS pins the card to the bottom instead.
  const wide = window.innerWidth > 700;
  let style;
  if (wide && rect) {
    const W = 340, pad = 18;
    const left = rect.left < 320 ? rect.left + rect.width + pad : Math.min(Math.max(rect.left + rect.width - W, 16), window.innerWidth - W - 16);
    const top = rect.left < 320 ? Math.min(Math.max(rect.top, 16), window.innerHeight - 260) : Math.min(rect.top + rect.height + pad, window.innerHeight - 260);
    style = { left, top };
  }
  const last = i === steps.length - 1;

  return (
    <div className="tour" role="presentation">
      {rect ? <div className="tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="tour-dim" />}
      <div className={`tour-card${rect ? "" : " tour-center"}`} style={style} ref={cardRef} tabIndex={-1} role="dialog" aria-label={t("Product tour")}>
        <p className="tour-count">{t("Step {n} of {total}", { n: i + 1, total: steps.length })}</p>
        <h3>{t(step.title)}</h3>
        <p className="tour-text">{t(step.text)}</p>
        <div className="tour-dots" aria-hidden="true">{steps.map((_, n) => <i key={n} className={n === i ? "on" : n < i ? "past" : ""} />)}</div>
        <div className="tour-actions">
          {!last && <button type="button" className="secondary" onClick={close}>{t("Skip")}</button>}
          {i > 0 && <button type="button" className="secondary" onClick={() => setI(i - 1)}>{t("Back")}</button>}
          <button type="button" onClick={() => (last ? close() : setI(i + 1))}>{last ? t("Finish") : t("Next")}</button>
        </div>
      </div>
    </div>
  );
}
