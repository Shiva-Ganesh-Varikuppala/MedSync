const pool = require("../config/database");
const { HttpError, badRequest, notFound } = require("../utils/httpError");
const { toEnum, toInt } = require("../utils/validate");

function scheduledAt(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) throw badRequest("scheduled_at must be YYYY-MM-DD HH:MM[:SS]");
    return value.replace("T", " ");
}
async function ownedItem(patientId, itemId) {
    const [rows] = await pool.execute("SELECT pi.prescription_item_id, pi.start_date, pi.end_date, pr.status FROM prescription_items pi JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id WHERE pi.prescription_item_id = ? AND pr.patient_id = ?", [itemId, patientId]);
    if (!rows.length) throw notFound("Prescription item not found");
    return rows[0];
}
// Extra reminders are for taking a dose at another time. The schedule itself is generated from the prescription.
async function create(patientId, input) {
    const itemId = toInt(input.prescription_item_id, "prescription_item_id"); const when = scheduledAt(input.scheduled_at); const item = await ownedItem(patientId, itemId);
    if (item.status === "CANCELLED") throw badRequest("This prescription was cancelled");
    const day = when.slice(0, 10);
    if (day < String(item.start_date).slice(0, 10)) throw badRequest("A reminder cannot be scheduled before the prescription starts");
    if (day > String(item.end_date).slice(0, 10)) throw badRequest("A reminder cannot be scheduled after the prescription ends");
    const [past] = await pool.execute("SELECT ? < NOW() AS is_past", [when]);
    if (Number(past[0].is_past)) throw badRequest("A reminder must be for a time that has not passed yet");
    const [dup] = await pool.execute("SELECT reminder_id FROM reminders WHERE prescription_item_id = ? AND scheduled_at = ?", [itemId, when]);
    if (dup.length) throw new HttpError(409, "There is already a reminder for this medicine at that time");
    const [count] = await pool.execute("SELECT COUNT(*) AS n FROM reminders WHERE prescription_item_id = ? AND DATE(scheduled_at) = ?", [itemId, day]);
    if (count[0].n >= 12) throw badRequest("That is already a lot of reminders for one day (limit 12 per medicine)");
    const [r] = await pool.execute("INSERT INTO reminders (prescription_item_id, scheduled_at) VALUES (?, ?)", [itemId, when]);
    return get(patientId, r.insertId);
}
async function get(patientId, reminderId) {
    const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE r.reminder_id = ? AND pr.patient_id = ?", [reminderId, patientId]);
    if (!rows.length) throw notFound("Reminder not found"); return rows[0];
}
// Doses whose time has passed and that the patient has not answered yet. Computed when asked - no background job.
async function due(patientId) {
    const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status IN ('ACTIVE', 'DISPENSED') JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE pr.patient_id = ? AND r.status = 'PENDING' AND r.scheduled_at <= NOW() ORDER BY r.scheduled_at", [patientId]);
    return rows;
}
async function list(patientId) { const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status IN ('ACTIVE', 'DISPENSED') JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE pr.patient_id = ? ORDER BY r.scheduled_at", [patientId]); return rows; }
async function updateStatus(patientId, reminderId, status) { const row = await get(patientId, reminderId); const next = toEnum(status, "status", ["PENDING", "TAKEN", "SKIPPED"]); await pool.execute("UPDATE reminders SET status = ?, status_updated_at = NOW() WHERE reminder_id = ?", [next, row.reminder_id]); return get(patientId, reminderId); }
// Only a dose that is still ahead and unanswered can be deleted. Answered, missed and overdue doses are the patient's record.
async function remove(patientId, reminderId) {
    const row = await get(patientId, reminderId);
    const [future] = await pool.execute("SELECT scheduled_at > NOW() AS is_future FROM reminders WHERE reminder_id = ?", [row.reminder_id]);
    if (row.status !== "PENDING" || !Number(future[0].is_future)) throw badRequest("Only an upcoming reminder that you have not answered can be deleted");
    await pool.execute("DELETE FROM reminders WHERE reminder_id = ?", [row.reminder_id]);
}
module.exports = { create, due, list, remove, updateStatus };
