const pool = require("../config/database");
const { badRequest, forbidden, notFound } = require("../utils/httpError");
const { toDate, toInt, toText } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { writeAudit } = require("../utils/audit");
const { generateSchedule, FREQUENCY_LABELS } = require("../utils/schedule");

// Whole days from start to end, both included.
const courseDays = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

// The number of doses per day drives the reminders, so it must agree with the text shown to the patient.
function dosesPerDay(item) {
    if (item.frequency_per_day !== undefined) return toInt(item.frequency_per_day, "items[].frequency_per_day", { min: 1, max: 6 });
    const match = Object.entries(FREQUENCY_LABELS).find(([, label]) => label.toLowerCase() === String(item.frequency || "").trim().toLowerCase());
    if (!match) throw badRequest("items[].frequency_per_day (1-6) is required");
    return Number(match[0]);
}

function itemInput(item) {
    const start = toDate(item.start_date, "items[].start_date");
    const end = toDate(item.end_date, "items[].end_date");
    if (end < start) throw badRequest("items[].end_date cannot be before start_date");
    if (courseDays(start, end) > 365) throw badRequest("A course cannot be longer than 365 days");
    const perDay = dosesPerDay(item);
    return [toInt(item.medicine_id, "items[].medicine_id"), toText(item.dosage, "items[].dosage", { max: 100 }), FREQUENCY_LABELS[perDay], start, end, toText(item.instructions, "items[].instructions", { max: 5000, required: false }), perDay];
}

async function create(doctorId, input, ctx = {}) {
    if (!doctorId) throw forbidden("Only doctors can create prescriptions");
    const patientId = toInt(input.patient_id, "patient_id");
    if (!Array.isArray(input.items) || !input.items.length) throw badRequest("items must contain at least one medicine");
    const items = input.items.map(itemInput);
    return withTransaction(async (conn) => {
        const [patients] = await conn.execute("SELECT patient_id FROM patients WHERE patient_id = ?", [patientId]);
        if (!patients.length) throw notFound("Patient not found");
        const ids = [...new Set(items.map(i => i[0]))];
        const markers = ids.map(() => "?").join(",");
        const [medicines] = await conn.execute(`SELECT medicine_id FROM medicines WHERE is_active = 1 AND medicine_id IN (${markers})`, ids);
        if (medicines.length !== ids.length) throw badRequest("One or more medicines do not exist or are inactive");
        const [header] = await conn.execute("INSERT INTO prescriptions (doctor_id, patient_id, prescription_date, diagnosis, notes) VALUES (?, ?, ?, ?, ?)", [doctorId, patientId, toDate(input.prescription_date, "prescription_date"), toText(input.diagnosis, "diagnosis", { max: 5000, required: false }), toText(input.notes, "notes", { max: 5000, required: false })]);
        let remindersCreated = 0;
        for (const item of items) {
            const [saved] = await conn.execute("INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, start_date, end_date, instructions, frequency_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [header.insertId, ...item]);
            // item = [medicineId, dosage, frequency, start, end, instructions, frequencyPerDay]
            const slots = generateSchedule(item[3], item[6], courseDays(item[3], item[4]));
            await conn.query("INSERT INTO reminders (prescription_item_id, scheduled_at) VALUES ?", [slots.map((s) => [saved.insertId, s])]);
            remindersCreated += slots.length;
        }
        // Part of the same transaction: if anything above fails, none of it is saved.
        await writeAudit({ userId: ctx.userId, action: "PRESCRIPTION_CREATE", entityType: "prescription", entityId: header.insertId, details: { patient_id: patientId, items: items.length, reminders_created: remindersCreated }, ip: ctx.ip }, conn);
        return header.insertId;
    });
}

async function get(id, user) {
    const prescriptionId = toInt(id, "prescriptionId");
    const [headers] = await pool.execute(
        `SELECT pr.prescription_id, pr.doctor_id, pr.patient_id, pr.prescription_date, pr.diagnosis, pr.notes, pr.status,
                du.name AS doctor_name, pu.name AS patient_name
           FROM prescriptions pr JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id
           JOIN patients p ON p.patient_id = pr.patient_id JOIN users pu ON pu.user_id = p.user_id WHERE pr.prescription_id = ?`, [prescriptionId]
    );
    const header = headers[0];
    if (!header) throw notFound("Prescription not found");
    // Anything the caller may not see answers 404, so prescription ids cannot be probed.
    const allowed = (user.role === "DOCTOR" && header.doctor_id === user.doctorId) || (user.role === "PATIENT" && header.patient_id === user.patientId) || user.role === "PHARMACY_STAFF";
    if (!allowed) throw notFound("Prescription not found");
    const [items] = await pool.execute("SELECT pi.prescription_item_id, pi.medicine_id, m.name AS medicine_name, m.generic_name, pi.dosage, pi.frequency, pi.frequency_per_day, pi.start_date, pi.end_date, pi.instructions FROM prescription_items pi JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE pi.prescription_id = ? ORDER BY pi.prescription_item_id", [prescriptionId]);
    return { ...header, items };
}

// mode: "active" | "past" | "all".
// "Active" = ACTIVE status and a course that has not ended yet (a course starting tomorrow counts).
// "Past" = everything else (cancelled, or every course finished).
async function forPatient(patientId, mode = "all") {
    if (mode === true) mode = "active"; // older callers pass a boolean
    const activeCond = "pr.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM prescription_items x WHERE x.prescription_id = pr.prescription_id AND x.end_date >= CURDATE())";
    const filter = mode === "active" ? ` AND ${activeCond}` : mode === "past" ? ` AND NOT (${activeCond})` : "";
    const [rows] = await pool.execute(
        `SELECT DISTINCT pr.prescription_id, pr.prescription_date, pr.diagnosis, pr.notes, pr.status, du.name AS doctor_name
           FROM prescriptions pr JOIN prescription_items pi ON pi.prescription_id = pr.prescription_id
           JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id
          WHERE pr.patient_id = ?${filter} ORDER BY pr.prescription_date DESC, pr.prescription_id DESC`, [patientId]
    );
    return rows;
}

async function forDoctor(doctorId) {
    const [rows] = await pool.execute(
        `SELECT pr.prescription_id, pr.patient_id, pu.name AS patient_name, pr.prescription_date, pr.diagnosis, pr.status,
                (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id = pr.prescription_id) AS item_count
           FROM prescriptions pr JOIN patients p ON p.patient_id = pr.patient_id JOIN users pu ON pu.user_id = p.user_id
          WHERE pr.doctor_id = ? ORDER BY pr.prescription_date DESC, pr.prescription_id DESC LIMIT 200`, [doctorId]
    );
    return rows;
}

// A prescription is cancelled, never deleted. Its reminders stop showing to the patient.
async function cancel(id, user, ip) {
    const prescriptionId = toInt(id, "prescriptionId");
    return withTransaction(async (conn) => {
        const [rows] = await conn.execute("SELECT status FROM prescriptions WHERE prescription_id = ? AND doctor_id = ? FOR UPDATE", [prescriptionId, user.doctorId]);
        if (!rows.length) throw notFound("Prescription not found");
        if (rows[0].status === "CANCELLED") throw badRequest("Prescription is already cancelled");
        await conn.execute("UPDATE prescriptions SET status = 'CANCELLED' WHERE prescription_id = ?", [prescriptionId]);
        await writeAudit({ userId: user.id, action: "PRESCRIPTION_CANCEL", entityType: "prescription", entityId: prescriptionId, ip }, conn);
        return { prescription_id: prescriptionId, status: "CANCELLED" };
    });
}

module.exports = { cancel, create, forDoctor, forPatient, get };
