const pool = require("../config/database");

// Everything a patient is currently on, from ALL doctors: ACTIVE prescriptions that have not ended yet
// (a course starting tomorrow counts). Only what a prescriber needs for safety: medicine, dose, dates and
// who prescribed it. Other doctors' diagnoses and notes are NOT included.
async function currentMedicines(patientId, doctorId) {
    const [rows] = await pool.execute(
        `SELECT pi.prescription_item_id, pi.medicine_id, m.name AS medicine_name, m.generic_name, pi.dosage, pi.frequency,
                pi.start_date, pi.end_date, pr.prescription_id, du.name AS doctor_name, (pr.doctor_id = ?) AS prescribed_by_me
           FROM prescription_items pi
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id
           JOIN medicines m ON m.medicine_id = pi.medicine_id
           JOIN doctors d ON d.doctor_id = pr.doctor_id
           JOIN users du ON du.user_id = d.user_id
          WHERE pr.patient_id = ? AND pr.status IN ('ACTIVE', 'DISPENSED') AND pi.end_date >= CURDATE()
          ORDER BY pi.end_date, m.name`, [doctorId, patientId]
    );
    return rows.map((r) => ({ ...r, prescribed_by_me: Boolean(r.prescribed_by_me) }));
}

module.exports = { currentMedicines };
