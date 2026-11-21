import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../components/ui";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import ResendVerification from "../components/ResendVerification";
import { LanguageSwitcher, useI18n } from "../i18n";
import "./Login.css";

// Small line icons for the fields.
const PATHS = {
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3 7l9 6 9-6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M17.9 17.9A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.1-5.9M9.9 5.1A10.5 10.5 0 0 1 12 5c7 0 11 7 11 7a19.9 19.9 0 0 1-3.2 4.2M1 1l22 22M14.1 14.1a3 3 0 1 1-4.2-4.2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M20 6L9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
};
const Ico = ({ n, size = 18 }) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[n]} /></svg>
);

// Slowly rising specks for the background: horizontal position, size, drift, duration and start delay. Fixed values, so every render looks the same.
const DUST = [[6, 5, 30, 24, 0], [14, 3, -20, 30, 6], [22, 6, 40, 27, 12], [31, 4, -35, 33, 3], [40, 3, 25, 29, 17], [48, 5, -30, 25, 9], [57, 4, 35, 31, 1], [65, 6, -25, 28, 14], [73, 3, 30, 34, 7], [81, 5, -40, 26, 19], [88, 4, 20, 32, 4], [94, 3, -15, 29, 11], [27, 3, 20, 35, 22], [69, 4, -30, 30, 21]]
  .map(([x, s, dx, d, dl]) => ({ "--x": `${x}%`, "--s": `${s}px`, "--dx": `${dx}px`, "--d": `${d}s`, "--dl": `-${dl}s` }));

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// 0 to 4: length 8, length 12, upper and lower case, a digit together with a symbol.
const strength = (p) => (p.length >= 8) + (p.length >= 12) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + (/\d/.test(p) && /[^A-Za-z0-9]/.test(p));
const STRENGTH_TEXT = ["Weak", "Weak", "Fair", "Good", "Strong"];

// Public sign-up is for patients only. Doctor and pharmacy accounts are created by an administrator.
export default function Login() {
  const { signIn, sessionNote } = useAuth();
  const { t } = useI18n();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState({ error: "", success: "" });
  const [loading, setLoading] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const [pending, setPending] = useState(null);        // after sign-up: { email, sent } -> "check your inbox" screen
  const [unverified, setUnverified] = useState("");    // email that tried to sign in before verifying
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  // The glow follows the pointer a little (parallax). Written straight to CSS variables, so React does not re-render.
  const parallax = (e) => { const r = e.currentTarget.getBoundingClientRect(); const bg = e.currentTarget.firstElementChild; if (!bg) return; bg.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5) * 2); bg.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5) * 2); };
  const mode = (reg) => { setRegister(reg); setMessage({ error: "", success: "" }); setUnverified(""); };
  const tiltCapsule = (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--tilt-x", `${((e.clientX-r.left)/r.width-.5)*12}deg`); e.currentTarget.style.setProperty("--tilt-y", `${((e.clientY-r.top)/r.height-.5)*-12}deg`); };
  const score = strength(form.password || "");
  const emailOk = EMAIL_OK.test(form.email || "");

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
    <main className="auth" onMouseMove={parallax}>
      <div className="auth-bg" aria-hidden="true">
        <span className="b1" /><span className="b2" /><span className="b3" /><span className="b4" /><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /><span className="light-beam" /><span className="grain" />
        <div className="waves"><i className="w1" /><i className="w2" /></div>
        <div className="dust">{DUST.map((s, i) => <i key={i} style={s} />)}</div>
      </div>
      <ThemeToggle floating />
      <div className="lang-fab"><LanguageSwitcher /></div>
      <section className="hero">
        <div className="brand"><Brand size={34} /></div>
        <h1>{t("Medication care,")} <em>{t("in sync.")}</em></h1>
        <p className="lead">{t("Smarter prescriptions. Safer medication. Better-connected healthcare.")}</p>
        <ul className="chips" aria-label="What MedSync does">
          <li><b>⌁</b> {t("Prescriptions")}</li><li><b>◷</b> {t("Smart reminders")}</li><li><b>✓</b> {t("Drug safety")}</li><li><b>+</b> {t("Pharmacy management")}</li>
        </ul>
        <div className="capsule-art" aria-hidden="true" onMouseMove={tiltCapsule} onMouseLeave={(e)=>{e.currentTarget.style.setProperty("--tilt-x","0deg");e.currentTarget.style.setProperty("--tilt-y","0deg");}}>
          <i className="orbit" /><i className="cap"><b /></i><i className="dot d1">+</i><i className="dot d2">♥</i><i className="dot d3">✓</i>
          <div className="glass-main">
            <header><strong>{t("Today's doses")}</strong><em>{t("Example preview")}</em></header>
            <ul>
              <li className="done"><b>08:00</b><span>Metformin 500 mg</span><i>✓</i></li>
              <li className="done"><b>13:00</b><span>Vitamin D3</span><i>✓</i></li>
              <li className="next"><b>21:00</b><span>Atorvastatin 10 mg</span><small>{t("Due soon")}</small></li>
            </ul>
            <div className="meter"><span style={{ width: "66%" }} /></div>
            <small className="meter-label">2 / 3 {t("taken")}</small>
          </div>
          <div className="float-card fc2"><i><Ico n="shield" /></i><span><strong>{t("Interaction check")}</strong><small>{t("No conflicts found")}</small></span></div>
          <div className="float-card fc3"><i><Ico n="repeat" /></i><span><strong>{t("Refill approved")}</strong><small>{t("Renewed in one tap")}</small></span></div>
        </div>
      </section>
      {pending ? (
        <section className="card form" aria-live="polite">
          <h2>{t("Check your inbox")}</h2>
          <p>We sent a verification link to <strong>{pending.email}</strong>. Open it to activate your account, then sign in. The link works for 24 hours.</p>
          {!pending.sent && <p className="error" role="alert">We could not send the email just now. Use the button below to try again.</p>}
          <p className="muted small">Not there? Check your spam folder.</p>
          <ResendVerification email={pending.email} />
          <button type="button" className="link" onClick={() => { setPending(null); mode(false); }}>{t("Back to sign in")}</button>
        </section>
      ) : (
      <form onSubmit={submit} className="card form" noValidate={false}>
        <div className="seg" role="tablist" aria-label={t("Sign in")} data-mode={register ? "register" : "login"}>
          <button type="button" role="tab" aria-selected={!register} className={register ? "" : "on"} onClick={() => mode(false)}>{t("Sign in")}</button>
          <button type="button" role="tab" aria-selected={register} className={register ? "on" : ""} onClick={() => mode(true)}>{t("Register")}</button>
        </div>
        <div className="form-head">
          <h2>{register ? t("Create patient account") : t("Welcome back!")}</h2>
          {!register && <p className="login-subtitle">{t("Sign in to your MedSync account.")}</p>}
        </div>
        <Notice error={message.error || ""} success={message.success || (!register ? sessionNote : "")} />
        {register && (
          <>
            <label className="fl"><span className="field"><Ico n="user" /><input name="name" placeholder=" " required onChange={change} /><span className="lbl">{t("Name")}</span></span></label>
            <label className="fl always"><span className="field"><Ico n="cal" /><input name="date_of_birth" type="date" placeholder=" " required onChange={change} /><span className="lbl">{t("Date of birth")}</span></span></label>
          </>
        )}
        <label className="fl"><span className="field"><Ico n="mail" /><input name="email" type="email" autoComplete="username" placeholder=" " required onChange={change} /><span className="lbl">{t("Email")}</span><span className={`tick${emailOk ? " on" : ""}`} aria-hidden="true"><Ico n="check" size={14} /></span></span></label>
        <label className="fl"><span className="field password-field"><Ico n="lock" /><input name="password" type={revealPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} placeholder=" " required minLength={register ? 8 : undefined} onChange={change} onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} onBlur={() => setCaps(false)} /><span className="lbl">{t("Password")}</span>
          <button type="button" className="reveal" aria-label={revealPassword ? t("Hide password") : t("Show password")} onClick={() => setRevealPassword(!revealPassword)}><Ico n={revealPassword ? "eyeOff" : "eye"} /></button></span></label>
        {caps && <p className="caps" role="status"><Ico n="alert" size={15} />{t("Caps Lock is on")}</p>}
        {register && (
          <div className="strength" data-s={form.password ? score : 0}>
            <span /><span /><span /><span />
            <small>{form.password ? t(STRENGTH_TEXT[score]) : t("At least 8 characters, with a letter and a number.")}</small>
          </div>
        )}
        <button type="submit" className="go" disabled={loading}>
          {loading ? <><i className="spin" aria-hidden="true" />{t("Working…")}</> : <>{register ? t("Register") : t("Sign in")}<Ico n="arrow" size={18} /></>}
        </button>
        {unverified && <ResendVerification email={unverified} />}
        {!register && <p className="staff-note"><Ico n="shield" /><span>{t("Doctors and pharmacy staff: your account is created by an administrator.")}</span></p>}
      </form>
      )}
    </main>
  );
}
