import React, { useEffect, useState } from "react";
import { api } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";

export default function VerifyEmail() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const [status, setStatus] = useState("loading"); // "loading" | "success" | "error"
  const [email, setEmail] = useState(params.get("email") || "");
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState(""); // "" | "sending" | "sent" | "error"

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    api(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res?.data?.email) setEmail(res.data.email);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function handleResend(e) {
    e.preventDefault();
    const addr = email || resendEmail;
    if (!addr) return;
    setResendStatus("sending");
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email: addr } });
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    }
  }

  return (
    <main className="auth">
      <ThemeToggle floating />
      <section className="hero">
        <div className="brand"><Brand size={34} /><span>MedSync</span></div>
        <h1>Email <em>Verification</em></h1>
        <p className="lead">Confirming your email address keeps your account secure.</p>
      </section>

      <div className="card form">
        {status === "loading" && (
          <p className="muted">Verifying your email address…</p>
        )}

        {status === "success" && (
          <>
            <p className="success" role="status">✅ Email verified! You can now sign in.</p>
            <a href="/" className="button" style={{ display: "inline-block", marginTop: "1rem" }}>Go to sign in →</a>
          </>
        )}

        {status === "error" && (
          <>
            <p className="error" role="alert">❌ This link is invalid or has expired.</p>
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              Enter your email address below to receive a new verification link.
            </p>
            {resendStatus === "sent" ? (
              <p className="success" role="status">A new link has been sent — check your inbox.</p>
            ) : (
              <form onSubmit={handleResend} style={{ marginTop: "1rem" }}>
                {!email && (
                  <label>
                    Email
                    <input
                      type="email"
                      required
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                )}
                {email && <p className="muted small">Account: <strong>{email}</strong></p>}
                <button disabled={resendStatus === "sending"}>
                  {resendStatus === "sending" ? "Sending…" : "Resend verification email"}
                </button>
                {resendStatus === "error" && (
                  <p className="error" role="alert" style={{ marginTop: "0.5rem" }}>
                    Something went wrong. Please try again.
                  </p>
                )}
              </form>
            )}
            <a href="/" className="link" style={{ display: "block", marginTop: "1rem" }}>← Back to sign in</a>
          </>
        )}
      </div>
    </main>
  );
}
