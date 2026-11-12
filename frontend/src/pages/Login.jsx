import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../components/ui";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";

// Public sign-up is for patients only. Doctor and pharmacy accounts are created by an administrator.
export default function Login() {
  const { signIn, sessionNote } = useAuth();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState({ error: "", success: "" });
  const [loading, setLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resendStatus, setResendStatus] = useState(""); // "" | "sending" | "sent"
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ error: "", success: "" });
    setNeedsVerify(false);
    try {
      if (register) {
        await api("/auth/register", { method: "POST", body: { ...form, role: "PATIENT" } });
        setRegister(false);
        setMessage({ error: "", success: "Registration successful! Please check your email to verify your account before signing in." });
      } else {
        const { data } = await api("/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
        signIn(data);
      }
    } catch (err) {
      if (err.status === 403 && /verify your email/i.test(err.message)) {
        setNeedsVerify(true);
      }
      setMessage({ error: err.message, success: "" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendStatus("sending");
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email: form.email } });
      setResendStatus("sent");
    } catch {
      setResendStatus("");
      setMessage((m) => ({ ...m, error: "Could not resend verification email. Please try again." }));
    }
  }

  return (
    <main className="auth">
      <ThemeToggle floating />
      <section className="hero">
        <div className="brand"><Brand size={34} /><span>MedSync</span></div>
        <h1>Medication care, <em>in sync.</em></h1>
        <p className="lead">Prescriptions, dose reminders and pharmacy stock in one place, so the right medicine reaches the right patient on time.</p>
        <ul className="chips" aria-label="What MedSync does">
          <li>Prescriptions</li><li>Dose reminders</li><li>Interaction checks</li><li>Pharmacy stock</li>
        </ul>
        <div className="capsule-art" aria-hidden="true"><i className="cap"><b /></i><i className="dot d1" /><i className="dot d2" /><i className="dot d3" /></div>
      </section>
      <form onSubmit={submit} className="card form">
        <h2>{register ? "Create patient account" : "Sign in"}</h2>
        <Notice error={message.error || ""} success={message.success || (!register ? sessionNote : "")} />
        {needsVerify && resendStatus !== "sent" && (
          <button
            type="button"
            className="link"
            disabled={resendStatus === "sending"}
            onClick={handleResend}
            style={{ marginBottom: "0.5rem" }}
          >
            {resendStatus === "sending" ? "Sending…" : "Resend verification link"}
          </button>
        )}
        {resendStatus === "sent" && (
          <p className="success" role="status">Verification email sent — check your inbox.</p>
        )}
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
        <button type="button" className="link" onClick={() => { setRegister(!register); setMessage({ error: "", success: "" }); setNeedsVerify(false); setResendStatus(""); }}>
          {register ? "Already have an account? Sign in" : "New patient? Create an account"}
        </button>
        {!register && <p className="muted small">Doctors and pharmacy staff: your account is created by an administrator.</p>}
      </form>
    </main>
  );
}
