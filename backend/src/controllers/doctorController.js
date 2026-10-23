const pool = require("../config/database");
const { notFound } = require("../utils/httpError");
const { likeEscape, toInt, toText } = require("../utils/validate");
const { writeAudit } = require("../utils/audit");
const prescriptions = require("../services/prescriptionService");

async function me(req, res) {
    const [rows] = await pool.execute("SELECT d.doctor_id, u.user_id, u.name, u.email, u.phone, d.license_number, d.specialization FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ?", [req.user.doctorId]);
    if (!rows.length) throw notFound("Doctor profile not found");
    res.json({ success: true, message: "Profile retrieved successfully", data: rows[0] });
}
async function patients(req, res) {
    // At least 2 characters, so the whole patient registry cannot be listed with an empty search.
    const q = toText(req.query.q, "q", { min: 2, max: 100 });
    const term = `%${likeEscape(q)}%`;
    const [rows] = await pool.execute("SELECT p.patient_id, u.name, p.date_of_birth, p.gender FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.is_active = 1 AND (CAST(p.patient_id AS CHAR) = ? OR u.name LIKE ?) ORDER BY u.name LIMIT 50", [q, term]);
    res.json({ success: true, message: "Patients retrieved successfully", data: rows });
}
async function patient(req, res) {
    const id = toInt(req.params.patientId, "patientId");
    const [rows] = await pool.execute("SELECT p.patient_id, u.name, u.email, u.phone, p.date_of_birth, p.gender, p.address FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?", [id]);
    if (!rows.length) throw notFound("Patient not found");
    res.json({ success: true, message: "Patient retrieved successfully", data: rows[0] });
}
async function patientPrescriptions(req, res) {
    const patientId = toInt(req.params.patientId, "patientId");
    const [exists] = await pool.execute("SELECT patient_id FROM patients WHERE patient_id = ?", [patientId]);
    if (!exists.length) throw notFound("Patient not found");
    const [rows] = await pool.execute("SELECT pr.prescription_id, pr.prescription_date, pr.diagnosis, pr.notes, pr.status, du.name AS doctor_name FROM prescriptions pr JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id WHERE pr.patient_id = ? AND pr.doctor_id = ? ORDER BY pr.prescription_date DESC", [patientId, req.user.doctorId]);
    await writeAudit({ userId: req.user.id, action: "PATIENT_HISTORY_VIEW", entityType: "patient", entityId: patientId, ip: req.ip });
    res.json({ success: true, message: "Prescriptions retrieved successfully", data: rows });
}
async function myPrescriptions(req, res) { res.json({ success: true, message: "Prescriptions retrieved successfully", data: await prescriptions.forDoctor(req.user.doctorId) }); }
module.exports = { me, myPrescriptions, patient, patientPrescriptions, patients };
