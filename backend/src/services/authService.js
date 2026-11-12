const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { jwtSecret } = require("../config/env");
const { badRequest, forbidden, notFound, unauthorized } = require("../utils/httpError");
const { writeAudit } = require("../utils/audit");
const { toDate, toEnum, toInt, toText } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const messageSender = require("./messageSender");

const ROLES = ["DOCTOR", "PATIENT", "PHARMACY_STAFF"];
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

function hashToken(raw) {
    return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function password(value) {
    if (typeof value !== "string" || value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        throw badRequest("password must be at least 8 characters and include a letter and number");
    }
    return value;
}

function email(value) {
    const result = toText(value, "email", { max: 255 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw badRequest("email must be valid");
    return result;
}

function safeUser(row) {
    return {
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        phone: row.phone,
        ...(row.pharmacy_id ? { pharmacy_id: row.pharmacy_id } : {})
    };
}

async function register(input) {
    const role = input.role === undefined ? "PATIENT" : toEnum(input.role, "role", ROLES);
    if (role !== "PATIENT") throw forbidden("Only patient accounts can be self-registered");
    const user = {
        name: toText(input.name, "name", { max: 100 }),
        email: email(input.email),
        password: password(input.password),
        phone: toText(input.phone, "phone", { max: 20, required: false })
    };
    const passwordHash = await bcrypt.hash(user.password, 12);

    return withTransaction(async (conn) => {
        const [existing] = await conn.execute("SELECT user_id FROM users WHERE email = ?", [user.email]);
        if (existing.length) throw badRequest("An account with this email already exists");
        const [created] = await conn.execute(
            "INSERT INTO users (name, email, password_hash, role, phone, email_verified_at) VALUES (?, ?, ?, ?, ?, NOW())",
            [user.name, user.email, passwordHash, role, user.phone]
        );
        const userId = created.insertId;

        if (role === "DOCTOR") {
            const license = toText(input.license_number, "license_number", { max: 100 });
            const specialization = toText(input.specialization, "specialization", { max: 100 });
            const [licenses] = await conn.execute("SELECT doctor_id FROM doctors WHERE license_number = ?", [license]);
            if (licenses.length) throw badRequest("license_number is already registered");
            await conn.execute("INSERT INTO doctors (user_id, license_number, specialization) VALUES (?, ?, ?)", [userId, license, specialization]);
        } else if (role === "PATIENT") {
            await conn.execute(
                "INSERT INTO patients (user_id, date_of_birth, gender, address) VALUES (?, ?, ?, ?)",
                [userId, toDate(input.date_of_birth, "date_of_birth"), toText(input.gender, "gender", { max: 30, required: false }), toText(input.address, "address", { max: 255, required: false })]
            );
        } else {
            const pharmacyId = toInt(input.pharmacy_id, "pharmacy_id");
            const [pharmacy] = await conn.execute("SELECT pharmacy_id FROM pharmacies WHERE pharmacy_id = ?", [pharmacyId]);
            if (!pharmacy.length) throw badRequest("pharmacy_id does not exist");
            await conn.execute("INSERT INTO pharmacy_staff (user_id, pharmacy_id) VALUES (?, ?)", [userId, pharmacyId]);
        }

        // Generate and store email verification token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await conn.execute(
            "INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))",
            [userId, tokenHash]
        );

        // Send verification email (non-fatal)
        messageSender.sendVerificationEmail(user.email, rawToken).catch((err) => {
            console.error("[Email Verification] Failed to send verification email:", err.message);
        });

        return { user_id: userId, name: user.name, email: user.email, role, email_verified: false };
    });
}

function signToken(user) {
    return jwt.sign({ sub: user.user_id, role: user.role }, jwtSecret, {
        algorithm: "HS256",
        expiresIn: process.env.JWT_EXPIRES_IN || "1h"
    });
}

async function createRefreshToken(userId, { ip = null, userAgent = null } = {}, conn = pool) {
    const rawToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = hashToken(rawToken);
    await conn.execute(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?)`,
        [userId, tokenHash, ip, userAgent ? userAgent.slice(0, 255) : null]
    );
    return rawToken;
}

async function login(input, ip, userAgent = null) {
    const userEmail = email(input.email);
    if (typeof input.password !== "string" || !input.password) throw unauthorized("Invalid email or password");
    const [rows] = await pool.execute(
        "SELECT u.user_id, u.name, u.email, u.password_hash, u.role, u.phone, u.is_active, u.email_verified_at, ps.pharmacy_id FROM users u LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id WHERE u.email = ?",
        [userEmail]
    );
    const user = rows[0];
    const passwordOk = await bcrypt.compare(input.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !user.is_active || !passwordOk) {
        await writeAudit({ userId: user ? user.user_id : null, action: "LOGIN_FAILED", entityType: "user", entityId: user ? user.user_id : null, ip }).catch(() => {});
        throw unauthorized("Invalid email or password");
    }
    if (!user.email_verified_at) {
        throw forbidden("Please verify your email address before signing in. Check your inbox or request a new verification link.");
    }
    await writeAudit({ userId: user.user_id, action: "LOGIN", entityType: "user", entityId: user.user_id, ip }).catch(() => {});

    const refreshToken = await createRefreshToken(user.user_id, { ip, userAgent });

    return {
        token: signToken(user),
        refreshToken,
        user: safeUser(user)
    };
}

async function rotateRefreshToken(rawToken, { ip = null, userAgent = null } = {}) {
    if (!rawToken || typeof rawToken !== "string") throw unauthorized("Refresh token is required");
    const tokenHash = hashToken(rawToken);

    return withTransaction(async (conn) => {
        const [rows] = await conn.execute(
            `SELECT token_id, user_id, expires_at, revoked_at, replaced_by_hash
               FROM refresh_tokens
              WHERE token_hash = ?
              FOR UPDATE`,
            [tokenHash]
        );

        if (!rows.length) throw unauthorized("Invalid refresh token");
        const tok = rows[0];

        // Token reuse / theft detection: if an already revoked token is used, terminate all user sessions
        if (tok.revoked_at) {
            await conn.execute(
                "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
                [tok.user_id]
            );
            await conn.commit();
            await writeAudit({
                userId: tok.user_id,
                action: "TOKEN_THEFT_DETECTED",
                entityType: "user",
                entityId: tok.user_id,
                details: { token_id: tok.token_id },
                ip
            }).catch(() => {});
            throw unauthorized("Compromised session detected; please sign in again");
        }

        if (new Date(tok.expires_at) < new Date()) {
            throw unauthorized("Refresh token expired");
        }

        const [users] = await conn.execute(
            `SELECT u.user_id, u.name, u.email, u.role, u.phone, u.is_active, ps.pharmacy_id
               FROM users u
               LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id
              WHERE u.user_id = ? AND u.is_active = 1`,
            [tok.user_id]
        );
        if (!users.length) throw unauthorized("User is deactivated or not found");
        const user = users[0];

        const newAccessToken = signToken(user);
        const newRefreshToken = crypto.randomBytes(40).toString("hex");
        const newHash = hashToken(newRefreshToken);

        await conn.execute(
            `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE token_id = ?`,
            [newHash, tok.token_id]
        );

        await conn.execute(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?)`,
            [user.user_id, newHash, ip, userAgent ? userAgent.slice(0, 255) : null]
        );

        await writeAudit({
            userId: user.user_id,
            action: "TOKEN_REFRESH",
            entityType: "user",
            entityId: user.user_id,
            ip
        }, conn).catch(() => {});

        return {
            token: newAccessToken,
            refreshToken: newRefreshToken,
            user: safeUser(user)
        };
    });
}

async function revokeRefreshToken(rawToken, userId) {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    await pool.execute(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND user_id = ?`,
        [tokenHash, userId]
    );
}

async function getMe(userId) {
    const [rows] = await pool.execute(
        `SELECT u.user_id, u.name, u.email, u.role, u.phone, ps.pharmacy_id,
                p.date_of_birth, p.gender, p.address,
                d.license_number, d.specialization,
                ph.name AS pharmacy_name, ph.address AS pharmacy_address
           FROM users u
           LEFT JOIN patients p ON p.user_id = u.user_id
           LEFT JOIN doctors d ON d.user_id = u.user_id
           LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id
           LEFT JOIN pharmacies ph ON ph.pharmacy_id = ps.pharmacy_id
          WHERE u.user_id = ? AND u.is_active = 1`,
        [userId]
    );
    if (!rows.length) throw unauthorized();
    const r = rows[0];
    const user = safeUser(r);
    if (r.role === "PATIENT") user.profile = { date_of_birth: r.date_of_birth, gender: r.gender, address: r.address };
    if (r.role === "DOCTOR") user.profile = { license_number: r.license_number, specialization: r.specialization };
    if (r.role === "PHARMACY_STAFF") user.profile = { pharmacy_name: r.pharmacy_name, pharmacy_address: r.pharmacy_address };
    return user;
}

async function updateProfile(userId, role, input, ip) {
    const name = toText(input.name, "name", { max: 100 });
    const phone = toText(input.phone, "phone", { max: 20, required: false });
    await withTransaction(async (conn) => {
        await conn.execute("UPDATE users SET name = ?, phone = ? WHERE user_id = ?", [name, phone, userId]);
        if (role === "PATIENT") {
            await conn.execute("UPDATE patients SET date_of_birth = ?, gender = ?, address = ? WHERE user_id = ?", [
                toDate(input.date_of_birth, "date_of_birth"), toText(input.gender, "gender", { max: 30, required: false }), toText(input.address, "address", { max: 255, required: false }), userId
            ]);
        }
        await writeAudit({ userId, action: "PROFILE_UPDATE", entityType: "user", entityId: userId, ip }, conn);
    });
    return getMe(userId);
}

async function changePassword(userId, input, ip) {
    if (typeof input.current_password !== "string" || !input.current_password) throw badRequest("current_password is required");
    const next = password(input.new_password);
    if (next === input.current_password) throw badRequest("The new password must be different from the current one");
    const [rows] = await pool.execute("SELECT user_id, role, password_hash FROM users WHERE user_id = ? AND is_active = 1", [userId]);
    const user = rows[0];
    if (!user) throw unauthorized();
    if (!(await bcrypt.compare(input.current_password, user.password_hash))) {
        await writeAudit({ userId, action: "PASSWORD_CHANGE_FAILED", entityType: "user", entityId: userId, ip }).catch(() => {});
        throw badRequest("Current password is incorrect");
    }
    const hash = await bcrypt.hash(next, 12);
    await pool.execute("UPDATE users SET password_hash = ?, password_changed_at = FROM_UNIXTIME(?) WHERE user_id = ?", [hash, Math.floor(Date.now() / 1000), userId]);
    // Revoke all existing refresh tokens on password change
    await pool.execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    await writeAudit({ userId, action: "PASSWORD_CHANGE", entityType: "user", entityId: userId, ip }).catch(() => {});
    return { token: signToken(user) };
}

async function verifyEmail(rawToken) {
    if (!rawToken || typeof rawToken !== "string") throw badRequest("token is required");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    return withTransaction(async (conn) => {
        const [rows] = await conn.execute(
            `SELECT ev.id, ev.user_id, ev.expires_at, ev.used_at, u.email
               FROM email_verifications ev
               JOIN users u ON u.user_id = ev.user_id
              WHERE ev.token_hash = ?`,
            [tokenHash]
        );
        if (!rows.length) throw badRequest("This verification link is invalid or has expired.");
        const ev = rows[0];
        if (ev.used_at) throw badRequest("This verification link has already been used.");
        if (new Date(ev.expires_at) < new Date()) throw badRequest("This verification link has expired.");
        await conn.execute("UPDATE email_verifications SET used_at = NOW() WHERE id = ?", [ev.id]);
        await conn.execute("UPDATE users SET email_verified_at = NOW() WHERE user_id = ?", [ev.user_id]);
        await writeAudit({ userId: ev.user_id, action: "EMAIL_VERIFIED", entityType: "user", entityId: ev.user_id }, conn).catch(() => {});
        return { verified: true, email: ev.email };
    });
}

async function resendVerification(emailAddress) {
    if (!emailAddress || typeof emailAddress !== "string") return { sent: true };
    let userEmail;
    try { userEmail = email(emailAddress); } catch (_) { return { sent: true }; }
    const [rows] = await pool.execute(
        "SELECT user_id, email, email_verified_at FROM users WHERE email = ? AND is_active = 1",
        [userEmail]
    );
    if (!rows.length || rows[0].email_verified_at) return { sent: true };
    const user = rows[0];
    // Delete old unused tokens
    await pool.execute(
        "DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL",
        [user.user_id]
    );
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await pool.execute(
        "INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))",
        [user.user_id, tokenHash]
    );
    messageSender.sendVerificationEmail(user.email, rawToken).catch((err) => {
        console.error("[Email Verification] Failed to send verification email:", err.message);
    });
    return { sent: true };
}

module.exports = {
    changePassword,
    checkEmail: email,
    checkPassword: password,
    getMe,
    login,
    register,
    resendVerification,
    revokeRefreshToken,
    rotateRefreshToken,
    updateProfile,
    verifyEmail
};
