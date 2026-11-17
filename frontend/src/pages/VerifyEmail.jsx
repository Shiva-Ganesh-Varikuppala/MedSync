import React, { useEffect, useState } from "react";
import { api } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import ResendVerification from "../components/ResendVerification";

// Opened from the link in the email: /verify-email?token=...
// The token is sent with POST (a link that verifies on GET could be triggered by mail scanners).
// It is removed from the address bar straight away so it is not kept in history or screenshots.
const attempts = new Map(); // token -> promise, so React StrictMode's second run does not use the link twice

function readToken() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  if (token) window.history.replaceState(null, "", window.location.pathname);
  return token;
}

const toLogin = () => window.location.assign("/");

export default function VerifyEmail() {
  const [token] = useState(readToken);
  const [view, setView] = useState({ state: token ? "loading" : "invalid", message: token ? "" : "This verification link is not valid." });

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    if (!attempts.has(token)) attempts.set(token, api("/auth/verify-email", { method: "POST", body: { token } }).then(() => ({ state: "success" }), (err) => ({ state: err.status === 410 ? "expired" : err.status === 409 ? "used" : "invalid", message: err.status === 0 ? err.message : err.message, network: err.status === 0 })));
    attempts.get(token).then((result) => {
      if (!alive) return;
      if (result.network) { attempts.delete(token); setView({ state: "error", message: result.message }); return; }
      setView(result);
    });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (view.state !== "success") return undefined;
    const t = setTimeout(toLogin, 5000);
    return () => clearTimeout(t);
  }, [view.state]);

  const titles = { loading: "Verifying your email…", success: "Email verified", expired: "This link has expired", used: "Link already used", invalid: "This link is not valid", error: "Something went wrong" };
  const texts = {
    loading: "One moment, please.",
    success: "Thank you! Your email address is confirmed. Taking you to sign in…",
    expired: "Verification links work for 24 hours. Enter your email and we will send you a new one.",
    used: "This link was already used. If you verified your email, you can sign in.",
    invalid: "The link may be incomplete or replaced by a newer one. Request a new verification email below.",
    error: view.message
  };

  return (
    <main className="auth">
      <ThemeToggle floating />
      <section className="hero">
        <div className="brand"><Brand size={34} /><span>MedSync</span></div>
        <h1>Medication care, <em>in sync.</em></h1>
      </section>
      <section className="card form" aria-live="polite">
        <h2>{titles[view.state]}</h2>
        <p className={view.state === "success" ? "success" : view.state === "loading" ? "muted" : view.state === "used" ? "muted" : "error"} role={view.state === "success" ? "status" : undefined}>{texts[view.state]}</p>
        {(view.state === "expired" || view.state === "invalid") && <ResendVerification />}
        {view.state !== "loading" && <button type="button" className={view.state === "success" ? "" : "link"} onClick={toLogin}>Go to sign in</button>}
      </section>
    </main>
  );
}
