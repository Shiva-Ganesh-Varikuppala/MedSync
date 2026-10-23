const bcrypt = require("bcryptjs");
const pool = require("../config/database");
const { badRequest, forbidden, notFound } = require("../utils/httpError");
const { writeAudit } = require("../utils/audit");
const { toEnum, toInt, toText, pagination, likeEscape } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { checkEmail, checkPassword } = require("./authService");

const CREATABLE = ["DOCTOR", "PHARMACY_STAFF"];
const ROLES = ["DOCTOR", "PATIENT", "PHARMACY_STAFF", "ADMIN"];

async function listUsers(query) {
    const { limit, offset, page } = pagination(query, { defaultLimit: 25, maxLimit: 100 });
    const where = []; const params = [];
    if (query.role) { where.push("u.role = ?"); params.push(toEnum(query.role, "role", ROLES)); }
    if (query.q) { const t = toText(query.q, "q", { max: 100 }); where.push("(u.name LIKE ? OR u.email LIKE ?)"); params.push(`%${likeEscape(t)}%`, `%${likeEscape(t)}%`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await pool.query(
        `SELECT u.user_id, u.name, u.email, u.role, u.phone, u.is_active, u.created_at,
                d.license_number, d.specialization, ps.pharmacy_id, ph.name AS pharmacy_name
           FROM users u
           LEFT JOIN doctors d ON d.user_id = u.user_id
           LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id
           LEFT JOIN pharmacies ph ON ph.pharmacy_id = ps.pharmacy_id
           ${clause} ORDER BY u.created_at DESC, u.user_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
    );
    return { items: rows, page, limit };
}

// Doctor and pharmacy-staff accounts are created here, never through public registration.
async function createUser(admin, input, ip) {
    const role = toEnum(input.role, "role", CREATABLE);
    const name = toText(input.name, "name", { max: 100 });
    const emailValue = checkEmail(input.email);
    const hash = await bcrypt.hash(checkPassword(input.password), 12);
    const phone = toText(input.phone, "phone", { max: 20, required: false });

    return withTransaction(async (conn) => {
        const [existing] = await conn.execute("SELECT user_id FROM users WHERE email = ?", [emailValue]);
        if (existing.length) throw badRequest("An account with this email already exists");
        let profile;
        if (role === "DOCTOR") {
            const license = toText(input.license_number, "license_number", { max: 100 });
            const specialization = toText(input.specialization, "specialization", { max: 100 });
            const [dup] = await conn.execute("SELECT doctor_id FROM doctors WHERE license_number = ?", [license]);
            if (dup.length) throw badRequest("license_number is already registered");
            profile = { license, specialization };
        } else {
            const pharmacyId = toInt(input.pharmacy_id, "pharmacy_id");
            const [ph] = await conn.execute("SELECT pharmacy_id FROM pharmacies WHERE pharmacy_id = ?", [pharmacyId]);
            if (!ph.length) throw badRequest("pharmacy_id does not exist");
            profile = { pharmacyId };
        }
        const [created] = await conn.execute("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)", [name, emailValue, hash, role, phone]);
        const userId = created.insertId;
        if (role === "DOCTOR") await conn.execute("INSERT INTO doctors (user_id, license_number, specialization) VALUES (?, ?, ?)", [userId, profile.license, profile.specialization]);
        else await conn.execute("INSERT INTO pharmacy_staff (user_id, pharmacy_id) VALUES (?, ?)", [userId, profile.pharmacyId]);
        await writeAudit({ userId: admin.id, action: "USER_CREATE", entityType: "user", entityId: userId, details: { role }, ip }, conn);
        return { user_id: userId, name, email: emailValue, role, phone };
    });
}

async function setActive(admin, id, value, ip) {
    const userId = toInt(id, "userId");
    if (typeof value !== "boolean") throw badRequest("is_active must be true or false");
    if (userId === admin.id) throw forbidden("You cannot deactivate your own account");
    const [rows] = await pool.execute("SELECT user_id FROM users WHERE user_id = ?", [userId]);
    if (!rows.length) throw notFound("User not found");
    await pool.execute("UPDATE users SET is_active = ? WHERE user_id = ?", [value ? 1 : 0, userId]);
    await writeAudit({ userId: admin.id, action: value ? "USER_ACTIVATE" : "USER_DEACTIVATE", entityType: "user", entityId: userId, ip });
    return { user_id: userId, is_active: value };
}

async function createPharmacy(admin, input, ip) {
    const p = { name: toText(input.name, "name", { max: 150 }), address: toText(input.address, "address", { max: 255 }), phone: toText(input.phone, "phone", { max: 20 }), email: toText(input.email, "email", { max: 255, required: false }) };
    if (p.email) checkEmail(p.email);
    const [r] = await pool.execute("INSERT INTO pharmacies (name, address, phone, email) VALUES (?, ?, ?, ?)", [p.name, p.address, p.phone, p.email]);
    await writeAudit({ userId: admin.id, action: "PHARMACY_CREATE", entityType: "pharmacy", entityId: r.insertId, ip });
    return { pharmacy_id: r.insertId, ...p };
}

async function summary() {
    const [[counts]] = await pool.query("SELECT SUM(role='DOCTOR') AS doctors, SUM(role='PATIENT') AS patients, SUM(role='PHARMACY_STAFF') AS pharmacy_staff, SUM(is_active=0) AS deactivated FROM users");
    const [[p]] = await pool.query("SELECT COUNT(*) AS pharmacies FROM pharmacies");
    return { doctors: Number(counts.doctors), patients: Number(counts.patients), pharmacy_staff: Number(counts.pharmacy_staff), deactivated: Number(counts.deactivated), pharmacies: p.pharmacies };
}

module.exports = { createPharmacy, createUser, listUsers, setActive, summary };
