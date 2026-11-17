import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../components/ui";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import ResendVerification from "../components/ResendVerification";

// Public sign-up is for patients only. Doctor and pharmacy accounts are created by an administrator.
export default function Login() {
  const { signIn, sessionNote } = useAuth();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState({ error: "", success: "" });
  const [loading, setLoading] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [pending, setPending] = useState(null);        // after sign-up: { email, sent } -> "check your inbox" screen
  const [unverified, setUnverified] = useState("");    // email that tried to sign in before verifying
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const tiltCapsule = (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--tilt-x", `${((e.clientX-r.left)/r.width-.5)*12}deg`); e.currentTarget.style.setProperty("--tilt-y", `${((e.clientY-r.top)/r.height-.5)*-12}deg`); };

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ error: "", success: "" });
    setUnverified("");
    try {
      if (register) {
        const { data } = await api("/auth/register", { method: "POST", body: { ...form, role: "PATIENT" } });
        setPending({ email: form.email, sent: data.user.verification_email_sent !== false });
      } else {
        const { data } = await api("/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
        signIn(data);
      }
    } catch (err) {
      setMessage({ error: err.message, success: "" });
      if (!register && err.status === 403 && /verify your email/i.test(err.message)) setUnverified(form.email);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth">
      <ThemeToggle floating />
      <section className="hero">
        <div className="brand"><Brand size={34} /><span>MedSync</span></div>
        <h1>Medication care, <em>in sync.</em></h1>
        <p className="lead">Smarter prescriptions. Safer medication. Better-connected healthcare.</p>
        <ul className="chips" aria-label="What MedSync does">
          <li><b>⌁</b> Prescriptions</li><li><b>◷</b> Smart reminders</li><li><b>✓</b> Drug safety</li><li><b>+</b> Pharmacy management</li>
        </ul>
        <div className="capsule-art" aria-hidden="true" onMouseMove={tiltCapsule} onMouseLeave={(e)=>{e.currentTarget.style.setProperty("--tilt-x","0deg");e.currentTarget.style.setProperty("--tilt-y","0deg");}}><i className="orbit"/><i className="cap"><b /></i><i className="dot d1">+</i><i className="dot d2">♥</i><i className="dot d3">✓</i></div>
      </section>
      {pending ? (
        <section className="card form" aria-live="polite">
          <h2>Check your inbox</h2>
          <p>We sent a verification link to <strong>{pending.email}</strong>. Open it to activate your account, then sign in. The link works for 24 hours.</p>
          {!pending.sent && <p className="error" role="alert">We could not send the email just now. Use the button below to try again.</p>}
          <p className="muted small">Not there? Check your spam folder.</p>
          <ResendVerification email={pending.email} />
          <button type="button" className="link" onClick={() => { setPending(null); setRegister(false); setMessage({ error: "", success: "" }); }}>Back to sign in</button>
        </section>
      ) : (
      <form onSubmit={submit} className="card form">
        <h2>{register ? "Create patient account" : "Welcome back!"}</h2>
        {!register && <p className="login-subtitle">Sign in to your MedSync account.</p>}
        <Notice error={message.error || ""} success={message.success || (!register ? sessionNote : "")} />
        {register && (
          <>
            <label>Name<input name="name" required onChange={change} /></label>
            <label>Date of birth<input name="date_of_birth" type="date" required onChange={change} /></label>
          </>
        )}
        <label>Email<input name="email" type="email" autoComplete="username" required onChange={change} /></label>
        <label>Password<span className="password-field"><input name="password" type={revealPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : undefined} onChange={change} /><button type="button" className="reveal" aria-label={revealPassword ? "Hide password" : "Show password"} onClick={()=>setRevealPassword(!revealPassword)}>{revealPassword ? "Hide" : "Show"}</button></span></label>
        {register && <p className="muted small">At least 8 characters, with a letter and a number.</p>}
        <button disabled={loading}>{loading ? "Working…" : register ? "Register" : "Sign in"}</button>
        <button type="button" className="link" onClick={() => { setRegister(!register); setMessage({ error: "", success: "" }); }}>
          {register ? "Already have an account? Sign in" : "New patient? Create an account"}
        </button>
        {unverified && <ResendVerification email={unverified} />}
        {!register && <p className="muted small">Doctors and pharmacy staff: your account is created by an administrator.</p>}
      </form>
      )}
    </main>
  );
}
