// The "verify your email" message: a branded, mobile-friendly HTML version and a plain-text fallback.
// It is built from inline styles and tables only, because email programs ignore most modern CSS.
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BRAND = "#6d4aff";      // MedSync purple
const EXPIRY_TEXT = "24 hours";

function buildVerificationEmail({ name, link }) {
    const greeting = name ? `Hi ${name},` : "Hello,";
    const subject = "Verify your email address for MedSync";

    const text = [
        greeting,
        "",
        "Welcome to MedSync. Please confirm your email address to finish creating your account.",
        "",
        "Open this link to verify your email:",
        link,
        "",
        `The link works once and expires in ${EXPIRY_TEXT}.`,
        "",
        "If you did not create a MedSync account, you can ignore this email. Nothing will happen and no account will be activated.",
        "",
        "MedSync"
    ].join("\n");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Confirm your email address to start using MedSync. The link expires in ${EXPIRY_TEXT}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f2fb;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:${BRAND};padding:22px 28px;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:.3px;">&#10010; MedSync</span>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#e4dcff;margin-top:2px;">Medication care, in sync.</div>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;color:#25213a;">
        <h1 style="margin:0 0 12px 0;font-size:21px;line-height:1.3;color:#25213a;">Verify your email address</h1>
        <p style="margin:0 0 10px 0;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;">Welcome to MedSync. Please confirm that this is your email address so we can finish setting up your account.</p>
      </td></tr>
      <tr><td align="center" style="padding:0 28px 8px 28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
            <a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Verify Email</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;color:#25213a;">
        <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#5b5675;">Button not working? Copy this link into your browser:</p>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(link)}" target="_blank" style="color:${BRAND};">${escapeHtml(link)}</a></p>
        <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;"><strong>This link works once and expires in ${EXPIRY_TEXT}.</strong></p>
      </td></tr>
      <tr><td style="padding:14px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0;padding-top:16px;border-top:1px solid #e8e4f5;font-size:12.5px;line-height:1.6;color:#6f6a88;">If you did not create a MedSync account, you can safely ignore this email. No account will be activated without this link.</p>
      </td></tr>
    </table>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#8a85a3;margin:14px 0 0 0;">&copy; MedSync &middot; Smarter prescriptions. Safer medication.</p>
  </td></tr>
</table>
</body>
</html>`;

    return { subject, text, html };
}

module.exports = { buildVerificationEmail, escapeHtml };
