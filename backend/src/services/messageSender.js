// Sends real email (SMTP) and SMS (Twilio). Each is switched on only by settings in .env;
// with nothing configured MedSync keeps working and notices stay inside the app.
//
//   Email:  SMTP_HOST  [SMTP_PORT=587]  [SMTP_SECURE=true for port 465]  [SMTP_USER  SMTP_PASS]  [SMTP_FROM_NAME  SMTP_FROM_EMAIL | MAIL_FROM]  [FRONTEND_URL]
//   SMS:    TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_FROM  [DEFAULT_COUNTRY_CODE=+91]
const env = (k) => (process.env[k] || "").trim();

const emailConfigured = () => Boolean(env("SMTP_HOST"));
const smsConfigured = () => Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM"));

// What is switched on, without any secret in it.
function status() {
    return {
        email: { configured: emailConfigured(), host: emailConfigured() ? env("SMTP_HOST") : null, from: emailConfigured() ? mailFromText() : null },
        sms: { configured: smsConfigured(), from: smsConfigured() ? env("TWILIO_FROM") : null }
    };
}

// Sender: SMTP_FROM_NAME + SMTP_FROM_EMAIL, else the older MAIL_FROM, else the SMTP user.
const mailFrom = () => {
    const address = env("SMTP_FROM_EMAIL");
    if (address) return { name: env("SMTP_FROM_NAME") || "MedSync", address };
    return env("MAIL_FROM") || env("SMTP_USER") || "MedSync <no-reply@medsync.local>";
};
const mailFromText = () => { const f = mailFrom(); return typeof f === "string" ? f : `${f.name} <${f.address}>`; };

// Where links in emails point (the website, not the API).
const frontendUrl = () => (env("FRONTEND_URL") || env("APP_URL") || "http://localhost:5173").replace(/\/+$/, "");

let cached = { key: null, transport: null };
function transport() {
    let nodemailer;
    try { nodemailer = require("nodemailer"); } catch (_) { throw new Error("Email is set up but the 'nodemailer' package is missing. Run: npm install nodemailer"); }
    const cfg = { host: env("SMTP_HOST"), port: Number(env("SMTP_PORT")) || 587, secure: env("SMTP_SECURE") === "true", user: env("SMTP_USER"), pass: env("SMTP_PASS") };
    const startTls = !cfg.secure && cfg.port === 587; // never fall back to an unencrypted login on 587
    const key = JSON.stringify(cfg);
    if (cached.key !== key) {
        cached = {
            key,
            transport: nodemailer.createTransport({
                host: cfg.host, port: cfg.port, secure: cfg.secure, ...(startTls ? { requireTLS: true } : {}),
                ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
                connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000
            })
        };
    }
    return cached.transport;
}

async function sendEmail({ to, subject, text, html }) {
    if (!emailConfigured()) throw new Error("Email is not set up on the server");
    if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("No valid email address on file");
    await transport().sendMail({ from: mailFrom(), to, subject, text, ...(html ? { html } : {}) });
}

// Checks the SMTP settings by connecting and signing in (no email is sent).
// The answer never contains the password.
async function verifySmtp() {
    const out = { ok: false, configured: emailConfigured(), host: env("SMTP_HOST") || null, port: Number(env("SMTP_PORT")) || 587, secure: env("SMTP_SECURE") === "true", sign_in_set: Boolean(env("SMTP_USER") && env("SMTP_PASS")), from: emailConfigured() ? mailFromText() : null, problem: null };
    if (!out.configured) { out.problem = "SMTP_HOST is not set"; return out; }
    if (!out.sign_in_set) { out.problem = "SMTP_USER and SMTP_PASS must both be set"; return out; }
    try {
        await transport().verify();
        out.ok = true;
    } catch (e) {
        const pass = env("SMTP_PASS");
        let msg = String(e && e.message || "connection failed");
        if (pass) msg = msg.split(pass).join("***");
        out.problem = msg.slice(0, 200);
    }
    return out;
}

// The sign-up confirmation. The link carries the raw token, so neither is ever logged.
async function sendVerificationEmail(toEmail, rawToken, name) {
    const { buildVerificationEmail } = require("../utils/verificationEmail");
    const link = `${frontendUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const { subject, text, html } = buildVerificationEmail({ name, link });
    await sendEmail({ to: toEmail, subject, text, html });
}

// 98765 43210, 098765-43210, +91 98765 43210, 0091... -> +919876543210
function normalizePhone(raw) {
    let p = String(raw || "").replace(/[\s\-().]/g, "");
    if (p.startsWith("00")) p = `+${p.slice(2)}`;
    if (/^\d{10}$/.test(p)) p = `${env("DEFAULT_COUNTRY_CODE") || "+91"}${p}`;
    if (!/^\+\d{8,15}$/.test(p)) throw new Error("No valid phone number on file");
    return p;
}

async function sendSms({ to, text }) {
    if (!smsConfigured()) throw new Error("SMS is not set up on the server");
    const number = normalizePhone(to);
    const sid = env("TWILIO_ACCOUNT_SID");
    const base = env("TWILIO_API_BASE") || "https://api.twilio.com";
    let res;
    try {
        res = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ To: number, From: env("TWILIO_FROM"), Body: text.slice(0, 600) }),
            signal: AbortSignal.timeout(10000)
        });
    } catch (e) {
        throw new Error(`SMS provider could not be reached (${e.name === "TimeoutError" ? "timed out" : "network error"})`);
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`SMS provider refused the message (${res.status}${body.message ? `: ${String(body.message).slice(0, 150)}` : ""})`);
    }
}

// The phone-verification text. The code is never logged here.
async function sendVerificationSms(toPhone, code) {
    await sendSms({ to: toPhone, text: `MedSync: your verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.` });
}

module.exports = { emailConfigured, smsConfigured, status, sendEmail, sendSms, normalizePhone, verifySmtp, sendVerificationEmail, sendVerificationSms, frontendUrl };
