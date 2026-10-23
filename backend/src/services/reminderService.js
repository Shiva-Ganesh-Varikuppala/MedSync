const pool = require("../config/database");
const { badRequest, notFound } = require("../utils/httpError");
const { toEnum, toInt } = require("../utils/validate");

function scheduledAt(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) throw badRequest("scheduled_at must be YYYY-MM-DD HH:MM[:SS]");
    return value.replace("T", " ");
}
async function ownedItem(patientId, itemId) {
    const [rows] = await pool.execute("SELECT pi.prescription_item_id, pi.end_date FROM prescription_items pi JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id WHERE pi.prescription_item_id = ? AND pr.patient_id = ?", [itemId, patientId]);
    if (!rows.length) throw notFound("Prescription item not found");
    return rows[0];
}
async function create(patientId, input) {
    const itemId = toInt(input.prescription_item_id, "prescription_item_id"); const when = scheduledAt(input.scheduled_at); const item = await ownedItem(patientId, itemId);
    if (when.slice(0, 10) > item.end_date) throw badRequest("A reminder cannot be scheduled after the prescription ends");
    const [r] = await pool.execute("INSERT INTO reminders (prescription_item_id, scheduled_at) VALUES (?, ?)", [itemId, when]);
    return get(patientId, r.insertId);
}
async function get(patientId, reminderId) {
    const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE r.reminder_id = ? AND pr.patient_id = ?", [reminderId, patientId]);
    if (!rows.length) throw notFound("Reminder not found"); return rows[0];
}
// Doses whose time has passed and that the patient has not answered yet. Computed when asked - no background job.
async function due(patientId) {
    const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status = 'ACTIVE' JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE pr.patient_id = ? AND r.status = 'PENDING' AND r.scheduled_at <= NOW() ORDER BY r.scheduled_at", [patientId]);
    return rows;
}
async function list(patientId) { const [rows] = await pool.execute("SELECT r.reminder_id, r.prescription_item_id, r.scheduled_at, r.status, m.name AS medicine_name, pi.dosage, pi.frequency FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status = 'ACTIVE' JOIN medicines m ON m.medicine_id = pi.medicine_id WHERE pr.patient_id = ? ORDER BY r.scheduled_at", [patientId]); return rows; }
async function updateStatus(patientId, reminderId, status) { const row = await get(patientId, reminderId); const next = toEnum(status, "status", ["PENDING", "TAKEN", "SKIPPED"]); await pool.execute("UPDATE reminders SET status = ?, status_updated_at = NOW() WHERE reminder_id = ?", [next, row.reminder_id]); return get(patientId, reminderId); }
async function remove(patientId, reminderId) { const row = await get(patientId, reminderId); await pool.execute("DELETE FROM reminders WHERE reminder_id = ?", [row.reminder_id]); }
module.exports = { create, due, list, remove, updateStatus };
