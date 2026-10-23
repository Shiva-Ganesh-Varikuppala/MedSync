import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../components/ui";

// Public sign-up is for patients only. Doctor and pharmacy accounts are created by an administrator.
export default function Login() {
  const { signIn, sessionNote } = useAuth();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState({ error: "", success: "" });
  const [loading, setLoading] = useState(false);
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ error: "", success: "" });
    try {
      if (register) {
        await api("/auth/register", { method: "POST", body: { ...form, role: "PATIENT" } });
        setRegister(false);
        setMessage({ error: "", success: "Registration successful. Please sign in." });
      } else {
        const { data } = await api("/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
        signIn(data);
      }
    } catch (err) {
      setMessage({ error: err.message, success: "" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth">
      <section>
        <p className="eyebrow">MEDSYNC</p>
        <h1>Medication care, in sync.</h1>
        <p className="muted">Securely manage prescriptions, reminders, and pharmacy stock.</p>
      </section>
      <form onSubmit={submit} className="card form">
        <h2>{register ? "Create patient account" : "Sign in"}</h2>
        <Notice error={message.error || ""} success={message.success || (!register ? sessionNote : "")} />
        {register && (
          <>
            <label>Name<input name="name" required onChange={change} /></label>
            <label>Date of birth<input name="date_of_birth" type="date" required onChange={change} /></label>
          </>
        )}
        <label>Email<input name="email" type="email" autoComplete="username" required onChange={change} /></label>
        <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : undefined} onChange={change} /></label>
        {register && <p className="muted small">At least 8 characters, with a letter and a number.</p>}
        <button disabled={loading}>{loading ? "Working…" : register ? "Register" : "Sign in"}</button>
        <button type="button" className="link" onClick={() => { setRegister(!register); setMessage({ error: "", success: "" }); }}>
          {register ? "Already have an account? Sign in" : "New patient? Create an account"}
        </button>
        {!register && <p className="muted small">Doctors and pharmacy staff: your account is created by an administrator.</p>}
      </form>
    </main>
  );
}
