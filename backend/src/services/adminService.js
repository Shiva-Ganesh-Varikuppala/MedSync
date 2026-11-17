const bcrypt = require("bcryptjs");
const pool = require("../config/database");
const { badRequest, forbidden, notFound } = require("../utils/httpError");
const { writeAudit } = require("../utils/audit");
const { toEnum, toInt, toText, pagination, likeEscape } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { checkEmail, checkPassword } = require("./authService");
const blobStore = require("./blobStore");

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
           ${clause} ORDER BY u.created_at DESC, u.user_id DESC LIMIT ? OFFSET ?`, [...params, limit + 1, offset]
    );
    return { items: rows.slice(0, limit), page, limit, has_more: rows.length > limit };
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

// Permanently deletes a patient, doctor or pharmacy-staff account and everything that belongs to it.
//   patient:        their prescriptions (with items, reminders, attached files and dispensing rows) and appointments
//   doctor:         the prescriptions they wrote (these disappear from the patients' history too), templates, appointments
//   pharmacy staff: the dispensing rows they recorded (stock already taken from batches stays taken)
// Sign-in sessions, notifications and verification links go with the account. The audit log is kept
// (it only loses the link to the deleted user) and gets a USER_DELETE row. Cannot be undone.
async function deleteUser(admin, id, confirmEmail, ip) {
    const userId = toInt(id, "userId");
    if (userId === admin.id) throw forbidden("You cannot delete your own account");
    const [rows] = await pool.execute("SELECT user_id, name, email, role FROM users WHERE user_id = ?", [userId]);
    if (!rows.length) throw notFound("User not found");
    const target = rows[0];
    if (target.role === "ADMIN") throw forbidden("Administrator accounts cannot be deleted here");
    // Typing the address is the safety catch: a stray click or a copied request cannot delete anybody.
    if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== String(target.email).toLowerCase()) {
        throw badRequest("confirm_email must be the user's email address");
    }

    const blobs = [];
    const result = await withTransaction(async (conn) => {
        let removed = 0;
        const byColumn = target.role === "PATIENT" ? "patient_id" : target.role === "DOCTOR" ? "doctor_id" : null;
        let ownerId = null;
        if (byColumn) {
            const table = target.role === "PATIENT" ? "patients" : "doctors";
            const [[own]] = await conn.execute(`SELECT ${byColumn} AS id FROM ${table} WHERE user_id = ?`, [userId]);
            ownerId = own ? own.id : null;
        }
        if (ownerId !== null) {
            const rx = `JOIN prescriptions p ON p.prescription_id = {T}.prescription_id WHERE p.${byColumn} = ?`;
            const [files] = await conn.execute(`SELECT a.blob_name FROM prescription_attachments a ${rx.replace("{T}", "a")}`, [ownerId]);
            files.forEach((f) => blobs.push(f.blob_name));
            await conn.execute(`DELETE r FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions p ON p.prescription_id = pi.prescription_id WHERE p.${byColumn} = ?`, [ownerId]);
            await conn.execute(`DELETE d FROM dispensed_items d ${rx.replace("{T}", "d")}`, [ownerId]);
            await conn.execute(`DELETE a FROM prescription_attachments a ${rx.replace("{T}", "a")}`, [ownerId]);
            await conn.execute(`DELETE pi FROM prescription_items pi ${rx.replace("{T}", "pi")}`, [ownerId]);
            const [gone] = await conn.execute(`DELETE FROM prescriptions WHERE ${byColumn} = ?`, [ownerId]);
            removed = gone.affectedRows;
            // Appointments and (for doctors) templates are removed by the database (ON DELETE CASCADE).
            await conn.execute(target.role === "PATIENT" ? "DELETE FROM patients WHERE patient_id = ?" : "DELETE FROM doctors WHERE doctor_id = ?", [ownerId]);
        }
        // Rows this person created on other people's records (files they uploaded, medicines they dispensed).
        const [mine] = await conn.execute("SELECT blob_name FROM prescription_attachments WHERE uploaded_by = ?", [userId]);
        mine.forEach((f) => blobs.push(f.blob_name));
        await conn.execute("DELETE FROM prescription_attachments WHERE uploaded_by = ?", [userId]);
        await conn.execute("DELETE FROM dispensed_items WHERE dispensed_by = ?", [userId]);
        await conn.execute("DELETE FROM pharmacy_staff WHERE user_id = ?", [userId]);
        await conn.execute("DELETE FROM users WHERE user_id = ?", [userId]);
        await writeAudit({ userId: admin.id, action: "USER_DELETE", entityType: "user", entityId: userId, details: { role: target.role, name: target.name, email: target.email, prescriptions_removed: removed }, ip }, conn);
        return { user_id: userId, role: target.role, prescriptions_removed: removed };
    });
    // After the commit: a file that cannot be removed must not undo the deletion.
    for (const name of blobs) await blobStore.remove(name).catch(() => {});
    return result;
}

async function resetPassword(admin, id, newPassword, ip) {
    const userId = toInt(id, "userId");
    if (userId === admin.id) throw forbidden("Use My profile to change your own password");
    const hash = await bcrypt.hash(checkPassword(newPassword), 12);
    const [rows] = await pool.execute("SELECT user_id FROM users WHERE user_id = ?", [userId]);
    if (!rows.length) throw notFound("User not found");
    await pool.execute("UPDATE users SET password_hash = ?, password_changed_at = FROM_UNIXTIME(?) WHERE user_id = ?", [hash, Math.floor(Date.now() / 1000), userId]);
    // Signs the person out everywhere: old tokens predate password_changed_at and refresh tokens are revoked.
    await pool.execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    await writeAudit({ userId: admin.id, action: "USER_PASSWORD_RESET", entityType: "user", entityId: userId, ip });
    return { user_id: userId };
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

module.exports = { createPharmacy, createUser, deleteUser, listUsers, resetPassword, setActive, summary };
