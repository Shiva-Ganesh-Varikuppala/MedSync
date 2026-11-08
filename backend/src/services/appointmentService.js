const pool = require("../config/database");
const notifications = require("./notificationService");
const { HttpError, badRequest, notFound, conflict } = require("../utils/httpError");
const { toInt, toText, toEnum, pagination } = require("../utils/validate");

const STATUSES = ["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"];
const MAX_OPEN_PER_PATIENT = 5;
const MAX_DAYS_AHEAD = 90;
const FIRST_HOUR = 8; // slots run 08:00 - 19:30, every 30 minutes
const LAST_HOUR = 19;

const SELECT = `SELECT a.appointment_id, a.patient_id, a.doctor_id, a.status, a.reason, a.doctor_note,
        DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_at, a.scheduled_at < NOW() AS is_past,
        pu.name AS patient_name, du.name AS doctor_name, d.specialization
   FROM appointments a
   JOIN patients p ON p.patient_id = a.patient_id JOIN users pu ON pu.user_id = p.user_id
   JOIN doctors d ON d.doctor_id = a.doctor_id JOIN users du ON du.user_id = d.user_id`;

// Accepts "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM"; returns "YYYY-MM-DD HH:MM:00".
function parseSlot(value) {
    const m = typeof value === "string" && value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::00)?$/);
    if (!m) throw badRequest("scheduled_at must look like 2026-12-01 10:30");
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw badRequest("scheduled_at is not a real date");
    if (mi % 30 !== 0) throw badRequest("Appointments start on the hour or half hour");
    if (h < FIRST_HOUR || h > LAST_HOUR) throw badRequest(`Appointments run between ${FIRST_HOUR}:00 and ${LAST_HOUR}:30`);
    const p = (n) => String(n).padStart(2, "0");
    return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}:00`;
}

async function assertBookable(slot, db = pool) {
    const [[r]] = await db.query(
        "SELECT (? > NOW()) AS future, (? <= DATE_ADD(NOW(), INTERVAL ? DAY)) AS near", [slot, slot, MAX_DAYS_AHEAD]);
    if (!r.future) throw badRequest("Choose a time in the future");
    if (!r.near) throw badRequest(`Appointments can be booked up to ${MAX_DAYS_AHEAD} days ahead`);
}

async function doctorBusy(db, doctorId, slot, exceptId = 0) {
    const [rows] = await db.query("SELECT 1 FROM appointments WHERE doctor_id = ? AND scheduled_at = ? AND status = 'CONFIRMED' AND appointment_id <> ? LIMIT 1", [doctorId, slot, exceptId]);
    return rows.length > 0;
}
async function patientBusy(db, patientId, slot, exceptId = 0) {
    const [rows] = await db.query("SELECT 1 FROM appointments WHERE patient_id = ? AND scheduled_at = ? AND status IN ('REQUESTED','CONFIRMED') AND appointment_id <> ? LIMIT 1", [patientId, slot, exceptId]);
    return rows.length > 0;
}

// Fire and forget: a slow or failing mail server must never hold up (or break) a booking.
function tell(userId, email, title, message) {
    notifications.dispatch({ userId, channel: "EMAIL", recipient: email, title, message }).catch(() => {});
}

async function load(id) {
    const [rows] = await pool.query(`${SELECT} WHERE a.appointment_id = ?`, [toInt(id, "appointmentId")]);
    return rows[0] || null;
}
const userOf = async (kind, id) => (await pool.query(
    kind === "doctor" ? "SELECT u.user_id, u.email FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ?" : "SELECT u.user_id, u.email FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?", [id]))[0][0];

// Strangers get 404, never 403, so ids cannot be probed.
async function mine(user, id) {
    const a = await load(id);
    const owns = a && (user.role === "PATIENT" ? a.patient_id === user.patientId : a.doctor_id === user.doctorId);
    if (!owns) throw notFound("Appointment not found");
    return a;
}

async function doctors() {
    const [rows] = await pool.query(
        `SELECT d.doctor_id, u.name, d.specialization FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.is_active = 1 ORDER BY u.name`);
    return rows;
}

async function request(user, body) {
    const doctorId = toInt(body.doctor_id, "doctor_id");
    const reason = toText(body.reason, "reason", { min: 3, max: 255 });
    const slot = parseSlot(body.scheduled_at);
    await assertBookable(slot);
    const [[doc]] = await pool.query("SELECT d.doctor_id, u.user_id, u.email, u.name FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ? AND u.is_active = 1", [doctorId]);
    if (!doc) throw notFound("Doctor not found");
    const [[open]] = await pool.query("SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND status IN ('REQUESTED','CONFIRMED') AND scheduled_at > NOW()", [user.patientId]);
    if (open.n >= MAX_OPEN_PER_PATIENT) throw conflict(`You already have ${MAX_OPEN_PER_PATIENT} upcoming appointments. Cancel one first.`);
    if (await doctorBusy(pool, doctorId, slot)) throw conflict("That time is already taken. Pick another slot.");
    if (await patientBusy(pool, user.patientId, slot)) throw conflict("You already have an appointment at that time.");
    const [res] = await pool.query("INSERT INTO appointments (patient_id, doctor_id, scheduled_at, reason) VALUES (?, ?, ?, ?)", [user.patientId, doctorId, slot, reason]);
    const a = await load(res.insertId);
    tell(doc.user_id, doc.email, "New appointment request", `${user.name} requested an appointment on ${a.scheduled_at}: ${reason}`);
    return a;
}

async function list(user, query) {
    const { limit, offset } = pagination(query, { defaultLimit: 20, maxLimit: 50 });
    const where = [user.role === "PATIENT" ? "a.patient_id = ?" : "a.doctor_id = ?"];
    const args = [user.role === "PATIENT" ? user.patientId : user.doctorId];
    if (query.status) { where.push("a.status = ?"); args.push(toEnum(String(query.status).toUpperCase(), "status", STATUSES)); }
    if (query.when === "upcoming") where.push("a.scheduled_at >= NOW()");
    if (query.when === "past") where.push("a.scheduled_at < NOW()");
    const order = query.when === "past" ? "DESC" : "ASC";
    const [rows] = await pool.query(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY a.scheduled_at ${order}, a.appointment_id LIMIT ? OFFSET ?`, [...args, limit + 1, offset]);
    return { rows: rows.slice(0, limit), has_more: rows.length > limit };
}

async function cancel(user, id) {
    const a = await mine(user, id);
    if (user.role !== "PATIENT") throw new HttpError(403, "Only the patient can cancel. Doctors can decline or reschedule.");
    if (!["REQUESTED", "CONFIRMED"].includes(a.status)) throw conflict(`A ${a.status.toLowerCase()} appointment cannot be cancelled`);
    if (a.is_past) throw conflict("This appointment time has already passed");
    await pool.query("UPDATE appointments SET status = 'CANCELLED' WHERE appointment_id = ?", [a.appointment_id]);
    const d = await userOf("doctor", a.doctor_id);
    tell(d.user_id, d.email, "Appointment cancelled", `${a.patient_name} cancelled the appointment on ${a.scheduled_at}.`);
    return load(a.appointment_id);
}

async function decide(user, id, action, body = {}) {
    if (user.role !== "DOCTOR") throw new HttpError(403, "Only the doctor can do this");
    const a = await mine(user, id);
    const note = toText(body.note, "note", { required: action === "decline", min: 3, max: 255 });
    const p = await userOf("patient", a.patient_id);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // Lock this doctor's rows so two confirmations for one slot cannot both pass the check.
        await conn.query("SELECT appointment_id FROM appointments WHERE doctor_id = ? FOR UPDATE", [a.doctor_id]);
        const [[cur]] = await conn.query("SELECT status, scheduled_at < NOW() AS is_past FROM appointments WHERE appointment_id = ?", [a.appointment_id]);
        if (action === "complete") {
            if (cur.status !== "CONFIRMED") throw conflict("Only a confirmed appointment can be completed");
            if (!cur.is_past) {
                const [[started]] = await conn.query("SELECT scheduled_at <= NOW() AS s FROM appointments WHERE appointment_id = ?", [a.appointment_id]);
                if (!started.s) throw conflict("This appointment has not started yet");
            }
            await conn.query("UPDATE appointments SET status = 'COMPLETED', doctor_note = COALESCE(?, doctor_note) WHERE appointment_id = ?", [note, a.appointment_id]);
        } else {
            if (!["REQUESTED", "CONFIRMED"].includes(cur.status)) throw conflict(`A ${cur.status.toLowerCase()} appointment cannot be changed`);
            if (cur.is_past) throw conflict("This appointment time has already passed");
            if (action === "confirm") {
                if (cur.status === "CONFIRMED") throw conflict("Already confirmed");
                if (await doctorBusy(conn, a.doctor_id, `${a.scheduled_at}:00`, a.appointment_id)) throw conflict("You already have a confirmed appointment at that time");
                await conn.query("UPDATE appointments SET status = 'CONFIRMED', doctor_note = ? WHERE appointment_id = ?", [note, a.appointment_id]);
            } else if (action === "decline") {
                await conn.query("UPDATE appointments SET status = 'DECLINED', doctor_note = ? WHERE appointment_id = ?", [note, a.appointment_id]);
            } else if (action === "reschedule") {
                const slot = parseSlot(body.scheduled_at);
                await assertBookable(slot, conn);
                if (await doctorBusy(conn, a.doctor_id, slot, a.appointment_id)) throw conflict("You already have a confirmed appointment at that time");
                if (await patientBusy(conn, a.patient_id, slot, a.appointment_id)) throw conflict("The patient already has an appointment at that time");
                await conn.query("UPDATE appointments SET scheduled_at = ?, status = 'CONFIRMED', doctor_note = ? WHERE appointment_id = ?", [slot, note, a.appointment_id]);
            }
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
    const out = await load(a.appointment_id);
    const words = { confirm: "confirmed", decline: "declined", reschedule: "moved to a new time", complete: "marked as completed" }[action];
    tell(p.user_id, p.email, `Appointment ${words}`, `Dr. ${out.doctor_name} ${words} your appointment (${out.scheduled_at}).${out.doctor_note ? ` Note: ${out.doctor_note}` : ""}`);
    return out;
}

module.exports = { doctors, request, list, cancel, decide, STATUSES };
