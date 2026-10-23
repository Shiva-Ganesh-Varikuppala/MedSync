const pool = require("../config/database");
const prescriptions = require("../services/prescriptionService");
const { notFound } = require("../utils/httpError");
async function me(req, res) { const [rows] = await pool.execute("SELECT p.patient_id, u.user_id, u.name, u.email, u.phone, p.date_of_birth, p.gender, p.address FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?", [req.user.patientId]); if (!rows.length) throw notFound("Patient profile not found"); res.json({ success: true, message: "Profile retrieved successfully", data: rows[0] }); }
async function history(req, res) { res.json({ success: true, message: "Prescriptions retrieved successfully", data: await prescriptions.forPatient(req.user.patientId, req.query.status === "past" ? "past" : req.query.status === "active" ? "active" : "all") }); }
async function active(req, res) { res.json({ success: true, message: "Active prescriptions retrieved successfully", data: await prescriptions.forPatient(req.user.patientId, "active") }); }
async function detail(req, res) { res.json({ success: true, message: "Prescription retrieved successfully", data: await prescriptions.get(req.params.prescriptionId, req.user) }); }
module.exports = { active, detail, history, me };
