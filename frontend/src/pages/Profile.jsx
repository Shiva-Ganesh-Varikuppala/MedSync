import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice, Panel } from "../components/ui";

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
          <Details me={me} onSaved={saved} />
          <Password />
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
