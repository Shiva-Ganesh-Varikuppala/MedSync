const crypto = require("crypto");
const pool = require("../config/database");
const { jwtSecret } = require("../config/env");
const { HttpError, badRequest } = require("../utils/httpError");
const { writeAudit } = require("../utils/audit");
const { withTransaction } = require("../utils/transaction");
const messageSender = require("./messageSender");

// Optional phone verification: a 6-digit SMS code, valid 10 minutes, 5 tries, one new code a minute.
const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const COOLDOWN_SECONDS = () => {
    const v = process.env.PHONE_CODE_COOLDOWN_SECONDS;
    const n = v === undefined || v === "" ? 60 : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 60;
};

const hashCode = (userId, code) => crypto.createHmac("sha256", jwtSecret).update(`${userId}:${code}`).digest("hex");
const mask = (phone) => `${phone.slice(0, 3)}${"*".repeat(Math.max(phone.length - 7, 2))}${phone.slice(-4)}`;

// Sends a code to `input.phone`, or to the number already on the profile.
async function start(userId, input, ip) {
    const [[user]] = await pool.execute("SELECT phone FROM users WHERE user_id = ? AND is_active = 1", [userId]);
    if (!user) throw new HttpError(401, "Unauthorized");
    const raw = typeof input.phone === "string" && input.phone.trim() ? input.phone : user.phone;
    if (!raw) throw badRequest("Add a phone number first");
    let phone;
    try { phone = messageSender.normalizePhone(raw); } catch { throw badRequest("Enter a valid phone number, for example +91 98765 43210"); }

    const [recent] = await pool.execute(
        "SELECT 1 FROM phone_verifications WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 1",
        [userId, COOLDOWN_SECONDS()]
    );
    if (recent.length) throw new HttpError(429, "Please wait a minute before asking for another code.");

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    let id;
    await withTransaction(async (conn) => {
        await conn.execute("DELETE FROM phone_verifications WHERE user_id = ? AND used_at IS NULL", [userId]);
        const [r] = await conn.execute(
            "INSERT INTO phone_verifications (user_id, phone, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
            [userId, phone, hashCode(userId, code), CODE_MINUTES]
        );
        id = r.insertId;
    });

    let delivery = "sms";
    try {
        await messageSender.sendVerificationSms(phone, code);
    } catch (err) {
        if (/not set up/i.test(err.message) && process.env.NODE_ENV !== "production") {
            // Development only: no SMS provider, so the code is shown in the BACKEND terminal (never sent to the browser).
            delivery = "console";
            console.log(`[phone] SMS is not set up, so the code for ${mask(phone)} is ${code} (valid ${CODE_MINUTES} minutes). Development only.`);
        } else {
            await pool.execute("DELETE FROM phone_verifications WHERE id = ?", [id]).catch(() => {});
            console.warn(`[phone] verification SMS could not be sent: ${String(err.message || err).slice(0, 120)}`);
            throw new HttpError(/not set up/i.test(err.message) ? 503 : 502, /not set up/i.test(err.message) ? "SMS is not set up on the server." : "The SMS could not be sent. Check the number and try again.");
        }
    }
    await writeAudit({ userId, action: "PHONE_CODE_SENT", entityType: "user", entityId: userId, ip }).catch(() => {});
    return { sent: true, phone: mask(phone), expires_in_minutes: CODE_MINUTES, delivery };
}

// Checks the code. A wrong code is counted even though the request fails, so the count is saved before the error is raised.
async function confirm(userId, input, ip) {
    const code = typeof input.code === "string" || typeof input.code === "number" ? String(input.code).trim() : "";
    if (!/^\d{6}$/.test(code)) throw badRequest("Enter the 6-digit code.");

    const outcome = await withTransaction(async (conn) => {
        const [rows] = await conn.execute(
            "SELECT id, phone, code_hash, attempts, (expires_at < NOW()) AS expired FROM phone_verifications WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [userId]
        );
        if (!rows.length) return { error: badRequest("Ask for a new code first.") };
        const row = rows[0];
        if (Number(row.expired)) return { error: new HttpError(410, "This code has expired. Ask for a new one.") };
        if (row.attempts >= MAX_TRIES) return { error: new HttpError(429, "Too many wrong codes. Ask for a new one.") };
        const expected = Buffer.from(row.code_hash, "hex");
        const given = Buffer.from(hashCode(userId, code), "hex");
        if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
            await conn.execute("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ?", [row.id]);
            return { error: badRequest("That code is not right.") };
        }
        await conn.execute("UPDATE phone_verifications SET used_at = NOW() WHERE id = ?", [row.id]);
        await conn.execute("UPDATE users SET phone = ?, phone_verified_at = NOW() WHERE user_id = ?", [row.phone, userId]);
        await writeAudit({ userId, action: "PHONE_VERIFIED", entityType: "user", entityId: userId, ip }, conn);
        return { phone: row.phone };
    });
    if (outcome.error) throw outcome.error;
    return { verified: true, phone: outcome.phone };
}

module.exports = { confirm, start };
