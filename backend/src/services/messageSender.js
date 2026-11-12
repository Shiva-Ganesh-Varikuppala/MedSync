// Sends real email (SMTP) and SMS (Twilio). Each is switched on only by settings in .env;
// with nothing configured MedSync keeps working and notices stay inside the app.
//
//   Email:  SMTP_HOST  [SMTP_PORT=587]  [SMTP_SECURE=true for port 465]  [SMTP_USER  SMTP_PASS]  [MAIL_FROM]
//   SMS:    TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_FROM  [DEFAULT_COUNTRY_CODE=+91]
const env = (k) => (process.env[k] || "").trim();

const emailConfigured = () => Boolean(env("SMTP_HOST"));
const smsConfigured = () => Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM"));

// What is switched on, without any secret in it.
function status() {
    return {
        email: { configured: emailConfigured(), host: emailConfigured() ? env("SMTP_HOST") : null, from: emailConfigured() ? mailFrom() : null },
        sms: { configured: smsConfigured(), from: smsConfigured() ? env("TWILIO_FROM") : null }
    };
}

const mailFrom = () => env("MAIL_FROM") || env("SMTP_USER") || "MedSync <no-reply@medsync.local>";

let cached = { key: null, transport: null };
function transport() {
    let nodemailer;
    try { nodemailer = require("nodemailer"); } catch (_) { throw new Error("Email is set up but the 'nodemailer' package is missing. Run: npm install nodemailer"); }
    const cfg = { host: env("SMTP_HOST"), port: Number(env("SMTP_PORT")) || 587, secure: env("SMTP_SECURE") === "true", user: env("SMTP_USER"), pass: env("SMTP_PASS") };
    const key = JSON.stringify(cfg);
    if (cached.key !== key) {
        cached = {
            key,
            transport: nodemailer.createTransport({
                host: cfg.host, port: cfg.port, secure: cfg.secure,
                ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
                connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000
            })
        };
    }
    return cached.transport;
}

async function sendEmail({ to, subject, text }) {
    if (!emailConfigured()) throw new Error("Email is not set up on the server");
    if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("No valid email address on file");
    await transport().sendMail({ from: mailFrom(), to, subject, text });
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

async function sendVerificationEmail(toEmail, rawToken) {
    const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const link = `${appUrl}/verify-email?token=${rawToken}`;
    const subject = "MedSync — Verify your email address";
    const text = `Welcome to MedSync!\n\nPlease verify your email by clicking the link below (valid for 24 hours):\n\n${link}\n\nIf you did not create an account, ignore this email.`;
    if (emailConfigured()) {
        await sendEmail({ to: toEmail, subject, text });
    } else {
        console.log(`[Email Verification] (email not configured) To: ${toEmail} | Link: ${link}`);
    }
}

module.exports = { emailConfigured, smsConfigured, status, sendEmail, sendSms, normalizePhone, sendVerificationEmail };
