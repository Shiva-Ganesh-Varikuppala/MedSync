import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Notice } from "./ui";

// "Send me a new verification link". Shows loading / success / error, and waits a little between clicks.
// With `email` given it just shows the button; without it, it asks for the address.
export default function ResendVerification({ email: knownEmail = "", label = "Resend verification email" }) {
  const [email, setEmail] = useState(knownEmail);
  const [state, setState] = useState({ loading: false, error: "", success: "" });
  const [wait, setWait] = useState(0);

  useEffect(() => { setEmail(knownEmail); }, [knownEmail]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    if (!email.trim()) { setState({ loading: false, error: "Enter your email address.", success: "" }); return; }
    setState({ loading: true, error: "", success: "" });
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email: email.trim() } });
      setState({ loading: false, error: "", success: "If that address is waiting for verification, a new link is on its way. Check your inbox and spam folder." });
      setWait(60);
    } catch (err) {
      setState({ loading: false, error: err.message, success: "" });
    }
  }

  return (
    // A div, not a form: this is also placed inside the sign-in form, and forms cannot be nested.
    <div className="resend">
      {!knownEmail && <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resend(); } }} autoComplete="username" /></label>}
      <Notice error={state.error} success={state.success} />
      <button type="button" onClick={resend} disabled={state.loading || wait > 0}>
        {state.loading ? "Sending…" : wait > 0 ? `Resend available in ${wait}s` : label}
      </button>
    </div>
  );
}
