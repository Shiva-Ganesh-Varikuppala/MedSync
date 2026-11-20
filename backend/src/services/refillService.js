const pool = require("../config/database");
const notifications = require("./notificationService");
const prescriptions = require("./prescriptionService");
const { HttpError, badRequest, notFound, conflict } = require("../utils/httpError");
const { toInt, toText, toEnum, pagination, todayString, addDays } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { writeAudit } = require("../utils/audit");

const STATUSES = ["REQUESTED", "APPROVED", "DECLINED", "CANCELLED"];
const DAYS_BEFORE_END = Number(process.env.REFILL_DAYS_BEFORE_END) || 7;   // a refill can be asked for this many days before a course ends...
const DAYS_AFTER_END = Number(process.env.REFILL_DAYS_AFTER_END) || 30;    // ...and up to this many days after it ended
const MAX_OPEN_PER_PATIENT = 3;

const SELECT = `SELECT rr.refill_id, rr.prescription_id, rr.patient_id, rr.doctor_id, rr.status, rr.note, rr.doctor_note, rr.new_prescription_id,
        DATE_FORMAT(rr.created_at, '%Y-%m-%d %H:%i') AS requested_at, DATE_FORMAT(rr.decided_at, '%Y-%m-%d %H:%i') AS decided_at,
        pu.name AS patient_name, du.name AS doctor_name, pr.diagnosis,
        (SELECT GROUP_CONCAT(m.name ORDER BY x.prescription_item_id SEPARATOR ', ')
           FROM prescription_items x JOIN medicines m ON m.medicine_id = x.medicine_id WHERE x.prescription_id = rr.prescription_id) AS medicines
   FROM refill_requests rr
   JOIN prescriptions pr ON pr.prescription_id = rr.prescription_id
   JOIN patients p ON p.patient_id = rr.patient_id JOIN users pu ON pu.user_id = p.user_id
   JOIN doctors d ON d.doctor_id = rr.doctor_id JOIN users du ON du.user_id = d.user_id`;

// Fire and forget: a slow or failing mail server must never hold up (or break) a refill.
function tell(userId, email, title, message) {
    notifications.dispatch({ userId, channel: "EMAIL", recipient: email, title, message }).catch(() => {});
}
const userOf = async (kind, id) => (await pool.query(
    kind === "doctor" ? "SELECT u.user_id, u.email FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ?" : "SELECT u.user_id, u.email FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?", [id]))[0][0];

async function load(id) {
    const [rows] = await pool.query(`${SELECT} WHERE rr.refill_id = ?`, [toInt(id, "refillId")]);
    return rows[0] || null;
}
// Strangers get 404, never 403, so ids cannot be probed.
async function mine(user, id) {
    const r = await load(id);
    const owns = r && (user.role === "PATIENT" ? r.patient_id === user.patientId : r.doctor_id === user.doctorId);
    if (!owns) throw notFound("Refill request not found");
    return r;
}

// The patient's prescriptions that can be refilled right now: not cancelled, and the last course ends within the window.
async function eligible(patientId, onlyPrescriptionId = null) {
    const today = todayString();
    const from = addDays(today, -DAYS_AFTER_END), to = addDays(today, DAYS_BEFORE_END);
    const [rows] = await pool.query(
        `SELECT * FROM (
            SELECT pr.prescription_id, pr.diagnosis, DATE_FORMAT(pr.prescription_date, '%Y-%m-%d') AS prescription_date, pr.doctor_id, du.name AS doctor_name,
                   (SELECT DATE_FORMAT(MAX(x.end_date), '%Y-%m-%d') FROM prescription_items x WHERE x.prescription_id = pr.prescription_id) AS last_end_date,
                   (SELECT GROUP_CONCAT(m.name ORDER BY x.prescription_item_id SEPARATOR ', ')
                      FROM prescription_items x JOIN medicines m ON m.medicine_id = x.medicine_id WHERE x.prescription_id = pr.prescription_id) AS medicines,
                   EXISTS(SELECT 1 FROM refill_requests rr WHERE rr.prescription_id = pr.prescription_id AND rr.status = 'REQUESTED') AS has_open
              FROM prescriptions pr JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id
             WHERE pr.patient_id = ? AND pr.status IN ('ACTIVE', 'DISPENSED')${onlyPrescriptionId ? " AND pr.prescription_id = ?" : ""}
         ) t WHERE t.last_end_date >= ? AND t.last_end_date <= ? ORDER BY t.last_end_date, t.prescription_id`,
        onlyPrescriptionId ? [patientId, onlyPrescriptionId, from, to] : [patientId, from, to]
    );
    return rows.map((r) => ({ ...r, has_open: !!r.has_open }));
}

async function request(user, body, ip) {
    const prescriptionId = toInt(body.prescription_id, "prescription_id");
    const note = toText(body.note, "note", { max: 255, required: false });
    const [[own]] = await pool.query("SELECT status FROM prescriptions WHERE prescription_id = ? AND patient_id = ?", [prescriptionId, user.patientId]);
    if (!own) throw notFound("Prescription not found");
    if (own.status === "CANCELLED") throw conflict("This prescription was cancelled, so it cannot be refilled.");
    const [row] = await eligible(user.patientId, prescriptionId);
    if (!row) throw conflict(`A refill can be requested in the last ${DAYS_BEFORE_END} days of a course, and up to ${DAYS_AFTER_END} days after it ended.`);
    const [[doc]] = await pool.query("SELECT u.is_active FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ?", [row.doctor_id]);
    if (!doc || !doc.is_active) throw conflict("The prescribing doctor's account is not active. Book an appointment with another doctor instead.");

    const id = await withTransaction(async (conn) => {
        // Lock the prescription so two taps on "Request" cannot both pass the checks below.
        await conn.query("SELECT prescription_id FROM prescriptions WHERE prescription_id = ? FOR UPDATE", [prescriptionId]);
        const [[open]] = await conn.query("SELECT COUNT(*) AS n FROM refill_requests WHERE prescription_id = ? AND status = 'REQUESTED'", [prescriptionId]);
        if (open.n) throw conflict("You already have an open refill request for this prescription.");
        const [[all]] = await conn.query("SELECT COUNT(*) AS n FROM refill_requests WHERE patient_id = ? AND status = 'REQUESTED'", [user.patientId]);
        if (all.n >= MAX_OPEN_PER_PATIENT) throw conflict(`You already have ${MAX_OPEN_PER_PATIENT} open refill requests. Wait for an answer or cancel one.`);
        const [res] = await conn.query("INSERT INTO refill_requests (prescription_id, patient_id, doctor_id, note) VALUES (?, ?, ?, ?)", [prescriptionId, user.patientId, row.doctor_id, note]);
        await writeAudit({ userId: user.id, action: "REFILL_REQUEST", entityType: "refill_request", entityId: res.insertId, details: { prescription_id: prescriptionId }, ip }, conn);
        return res.insertId;
    });
    const out = await load(id);
    const d = await userOf("doctor", out.doctor_id);
    tell(d.user_id, d.email, "New refill request", `${user.name} asked for a refill of prescription #${prescriptionId} (${out.medicines}).${note ? ` Note: ${note}` : ""}`);
    return out;
}

async function list(user, query) {
    const { limit, offset } = pagination(query, { defaultLimit: 20, maxLimit: 50 });
    const where = [user.role === "PATIENT" ? "rr.patient_id = ?" : "rr.doctor_id = ?"];
    const args = [user.role === "PATIENT" ? user.patientId : user.doctorId];
    if (query.status) { where.push("rr.status = ?"); args.push(toEnum(String(query.status).toUpperCase(), "status", STATUSES)); }
    const [rows] = await pool.query(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY (rr.status = 'REQUESTED') DESC, rr.created_at DESC, rr.refill_id DESC LIMIT ? OFFSET ?`, [...args, limit + 1, offset]);
    return { rows: rows.slice(0, limit), has_more: rows.length > limit };
}

async function cancel(user, id, ip) {
    const r = await mine(user, id);
    if (user.role !== "PATIENT") throw new HttpError(403, "Only the patient can cancel. Doctors can approve or decline.");
    const [res] = await pool.query("UPDATE refill_requests SET status = 'CANCELLED', decided_at = NOW() WHERE refill_id = ? AND status = 'REQUESTED'", [r.refill_id]);
    if (!res.affectedRows) throw conflict(`A ${r.status.toLowerCase()} request cannot be cancelled`);
    await writeAudit({ userId: user.id, action: "REFILL_CANCEL", entityType: "refill_request", entityId: r.refill_id, ip });
    const d = await userOf("doctor", r.doctor_id);
    tell(d.user_id, d.email, "Refill request cancelled", `${r.patient_name} cancelled the refill request for prescription #${r.prescription_id}.`);
    return load(r.refill_id);
}

// Approve = write a NEW prescription with the same medicines, dosage and course length, starting today.
// It goes through prescriptionService.create, so interaction checks, reminders and the audit trail are exactly the same as for any prescription
// (a SEVERE interaction needs interaction_override_reason, as when writing one by hand).
async function approve(user, id, body = {}, ip) {
    if (user.role !== "DOCTOR") throw new HttpError(403, "Only the doctor can do this");
    const r = await mine(user, id);
    const note = toText(body.note, "note", { max: 255, required: false });
    // Claim the request first so a double click cannot create two prescriptions.
    const [claim] = await pool.query("UPDATE refill_requests SET status = 'APPROVED', decided_at = NOW() WHERE refill_id = ? AND status = 'REQUESTED'", [r.refill_id]);
    if (!claim.affectedRows) throw conflict(`This request is already ${r.status.toLowerCase()}.`);
    let newId;
    try {
        const [items] = await pool.query(
            `SELECT medicine_id, dosage, frequency_per_day, instructions, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
               FROM prescription_items WHERE prescription_id = ? ORDER BY prescription_item_id`, [r.prescription_id]);
        if (!items.length) throw badRequest("The original prescription has no medicines to refill");
        const today = todayString();
        const days = (s, e) => Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86400000) + 1;
        newId = await prescriptions.create(user.doctorId, {
            patient_id: r.patient_id, prescription_date: today, diagnosis: r.diagnosis, notes: `Refill of prescription #${r.prescription_id}.`,
            interaction_override_reason: body.interaction_override_reason,
            items: items.map((i) => ({ medicine_id: i.medicine_id, dosage: i.dosage, frequency_per_day: i.frequency_per_day, instructions: i.instructions, start_date: today, end_date: addDays(today, days(i.start_date, i.end_date) - 1) })),
        }, { userId: user.id, ip });
    } catch (err) {
        await pool.query("UPDATE refill_requests SET status = 'REQUESTED', decided_at = NULL WHERE refill_id = ? AND status = 'APPROVED' AND new_prescription_id IS NULL", [r.refill_id]);
        throw err;
    }
    await pool.query("UPDATE refill_requests SET new_prescription_id = ?, doctor_note = ? WHERE refill_id = ?", [newId, note, r.refill_id]);
    await writeAudit({ userId: user.id, action: "REFILL_APPROVE", entityType: "refill_request", entityId: r.refill_id, details: { prescription_id: r.prescription_id, new_prescription_id: newId }, ip });
    const out = await load(r.refill_id);
    const p = await userOf("patient", r.patient_id);
    tell(p.user_id, p.email, "Refill approved", `Dr. ${out.doctor_name} approved your refill. A new prescription (#${newId}) was created for ${out.medicines}.${note ? ` Note: ${note}` : ""}`);
    return out;
}

async function decline(user, id, body = {}, ip) {
    if (user.role !== "DOCTOR") throw new HttpError(403, "Only the doctor can do this");
    const r = await mine(user, id);
    const note = toText(body.note, "note", { min: 3, max: 255 });
    const [res] = await pool.query("UPDATE refill_requests SET status = 'DECLINED', doctor_note = ?, decided_at = NOW() WHERE refill_id = ? AND status = 'REQUESTED'", [note, r.refill_id]);
    if (!res.affectedRows) throw conflict(`This request is already ${r.status.toLowerCase()}.`);
    await writeAudit({ userId: user.id, action: "REFILL_DECLINE", entityType: "refill_request", entityId: r.refill_id, ip });
    const out = await load(r.refill_id);
    const p = await userOf("patient", r.patient_id);
    tell(p.user_id, p.email, "Refill declined", `Dr. ${out.doctor_name} declined your refill request for prescription #${r.prescription_id}. Note: ${note}`);
    return out;
}

module.exports = { eligible, request, list, cancel, approve, decline, STATUSES };
