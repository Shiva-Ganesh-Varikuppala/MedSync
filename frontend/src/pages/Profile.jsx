import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "../components/ui";
import { downloadFile } from "../components/download";

const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Administrator" };

export default function Profile({ onClose }) {
  const { call, user, token, signIn } = useAuth();
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { call("/auth/me").then((r) => setMe(r.data.user)).catch((e) => setError(e.message)); }, [call]);

  // Keep the name shown in the header in step with a saved change.
  const saved = (next) => { setMe(next); signIn({ token, user: { ...user, name: next.name, phone: next.phone } }); };

  return (
    <>
      <p><button className="link" onClick={onClose}>← Back to my workspace</button></p>
      <Notice error={error} />
      {me && (
        <section className="grid">
          <Details key={`${me.phone}|${me.phone_verified}`} me={me} onSaved={saved} />
          <PhoneVerify me={me} onVerified={saved} />
          <Password />
          {me.role === "PATIENT" && <MyData />}
        </section>
      )}
    </>
  );
}

function Details({ me, onSaved }) {
  const { call } = useAuth();
  const p = me.profile || {};
  const [f, setF] = useState({ name: me.name, phone: me.phone || "", date_of_birth: p.date_of_birth || "", gender: p.gender || "", address: p.address || "" });
  const [note, setNote] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const body = { name: f.name.trim(), phone: f.phone.trim() || undefined };
    if (me.role === "PATIENT") Object.assign(body, { date_of_birth: f.date_of_birth, gender: f.gender.trim() || undefined, address: f.address.trim() || undefined });
    try { const r = await call("/auth/me", { method: "PUT", body }); onSaved(r.data.user); setNote({ success: "Profile saved." }); }
    catch (err) { setNote({ error: err.message }); }
  }
  return (
    <Panel title="My profile">
      <dl className="facts">
        <dt>Role</dt><dd>{ROLE_TEXT[me.role]}</dd>
        <dt>Email</dt><dd>{me.email}</dd>
        {me.role === "DOCTOR" && <><dt>Licence</dt><dd>{p.license_number}</dd><dt>Specialization</dt><dd>{p.specialization}</dd></>}
        {me.role === "PHARMACY_STAFF" && <><dt>Pharmacy</dt><dd>{p.pharmacy_name}</dd></>}
      </dl>
      <p className="muted small">Email, role, licence and pharmacy can only be changed by an administrator.</p>
      <form className="form" onSubmit={submit}>
        <label>Full name<input required value={f.name} onChange={set("name")} /></label>
        <label>Phone<input value={f.phone} onChange={set("phone")} /></label>
        {me.role === "PATIENT" && (
          <>
            <label>Date of birth<input required type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></label>
            <label>Gender<input value={f.gender} onChange={set("gender")} /></label>
            <label>Address<input value={f.address} onChange={set("address")} /></label>
          </>
        )}
        <Notice {...note} />
        <button>Save changes</button>
      </form>
    </Panel>
  );
}

// Optional: confirm a phone number with a 6-digit SMS code. Nothing is blocked if it is skipped.
function PhoneVerify({ me, onVerified }) {
  const { call } = useAuth();
  const [phone, setPhone] = useState(me.phone || "");
  const [sent, setSent] = useState(null);   // { phone, delivery } once a code is on its way
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({});

  async function send(e) {
    e?.preventDefault();
    setBusy("send"); setNote({});
    try {
      const r = await call("/auth/phone/send-code", { method: "POST", body: { phone: phone.trim() || undefined } });
      setSent(r.data); setCode("");
      setNote({ success: r.data.delivery === "console" ? "SMS is not set up on this server (development): the code is printed in the backend terminal." : `We sent a 6-digit code to ${r.data.phone}. It works for ${r.data.expires_in_minutes} minutes.` });
    } catch (err) { setNote({ error: err.message }); } finally { setBusy(""); }
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy("verify"); setNote({});
    try {
      await call("/auth/phone/verify", { method: "POST", body: { code: code.trim() } });
      const r = await call("/auth/me");
      onVerified(r.data.user);
    } catch (err) { setNote({ error: err.message }); } finally { setBusy(""); }
  }

  return (
    <Panel title="Phone verification">
      {me.phone_verified ? (
        <p className="success" role="status">Verified: {me.phone}</p>
      ) : (
        <>
          <p className="muted small">Optional. Confirm your phone number with a code sent by SMS. If you change the number later, it needs to be verified again.</p>
          <form className="form" onSubmit={sent ? confirm : send}>
            <label>Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" disabled={!!sent && busy !== ""} /></label>
            {sent && <label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>}
            <Notice {...note} />
            <button disabled={!!busy || (!sent && !phone.trim())}>{busy === "send" ? "Sending…" : busy === "verify" ? "Checking…" : sent ? "Verify code" : "Send code"}</button>
            {sent && <button type="button" className="link" disabled={!!busy} onClick={send}>Send a new code</button>}
          </form>
        </>
      )}
    </Panel>
  );
}

// A patient's copy of their own data: everything in one JSON file, or the prescriptions or reminders as a spreadsheet.
function MyData() {
  const { call } = useAuth();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({});
  const day = new Date().toISOString().slice(0, 10);
  async function get(label, query, filename) {
    setBusy(label); setNote({});
    try { await downloadFile(call, `/export/my-data?${query}`, filename); setNote({ success: "Download started." }); }
    catch (e) { setNote({ error: e.message }); } finally { setBusy(""); }
  }
  return (
    <Panel title="Download my data">
      <p className="muted small">A copy of your profile, prescriptions and reminders. The file contains health information, so keep it somewhere safe.</p>
      <Notice {...note} />
      <div className="actions">
        <button className="secondary" disabled={!!busy} onClick={() => get("json", "format=json", `medsync-my-data-${day}.json`)}>{busy === "json" ? "Preparing…" : "Everything (JSON)"}</button>
        <button className="secondary" disabled={!!busy} onClick={() => get("rx", "format=csv&part=prescriptions", `medsync-my-prescriptions-${day}.csv`)}>{busy === "rx" ? "Preparing…" : "Prescriptions (CSV)"}</button>
        <button className="secondary" disabled={!!busy} onClick={() => get("rem", "format=csv&part=reminders", `medsync-my-reminders-${day}.csv`)}>{busy === "rem" ? "Preparing…" : "Reminders (CSV)"}</button>
      </div>
    </Panel>
  );
}

function Password() {
  const { call, user, signIn } = useAuth();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [note, setNote] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (f.next !== f.again) { setNote({ error: "The new passwords do not match." }); return; }
    try {
      const r = await call("/auth/password", { method: "PUT", body: { current_password: f.current, new_password: f.next } });
      signIn({ token: r.data.token, user }); // fresh token; older sessions are signed out by the server
      setF({ current: "", next: "", again: "" });
      setNote({ success: "Password changed. Your other sessions were signed out." });
    } catch (err) { setNote({ error: err.message }); }
  }
  return (
    <Panel title="Change password">
      <form className="form" onSubmit={submit}>
        <label>Current password<input required type="password" autoComplete="current-password" value={f.current} onChange={set("current")} /></label>
        <label>New password<input required type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={set("next")} /></label>
        <p className="muted small">At least 8 characters with a letter and a number.</p>
        <label>Repeat new password<input required type="password" autoComplete="new-password" value={f.again} onChange={set("again")} /></label>
        <Notice {...note} />
        <button>Change password</button>
      </form>
    </Panel>
  );
}
