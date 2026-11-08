const pool = require("../config/database");
const { toText, likeEscape } = require("../utils/validate");

const LIMIT = 5; // per group; this is a quick finder, not a report

// One "?" for the search term. EXISTS instead of a join + DISTINCT: MySQL 8 refuses DISTINCT with an ORDER BY column that is not selected.
const hasMedicine = `EXISTS (SELECT 1 FROM prescription_items i JOIN medicines m ON m.medicine_id = i.medicine_id WHERE i.prescription_id = pr.prescription_id AND m.name LIKE ?)`;

const medicines = async (term) => (await pool.query(
    `SELECT medicine_id AS id, name AS title, CONCAT_WS(' · ', generic_name, strength, dosage_form) AS subtitle
       FROM medicines WHERE name LIKE ? OR generic_name LIKE ? ORDER BY name LIMIT ?`, [term, term, LIMIT]))[0];

// Each role sees only what its own screens already let it see.
const finders = {
    PATIENT: (u, term) => ({
        Medicines: (tab) => medicines(term).then((r) => r.map((x) => ({ ...x, type: "medicine", tab }))),
        Prescriptions: async () => (await pool.query(
            `SELECT pr.prescription_id AS id, pr.diagnosis AS title,
                    CONCAT('#', pr.prescription_id, ' · ', pr.prescription_date, ' · ', pr.status) AS subtitle
               FROM prescriptions pr
              WHERE pr.patient_id = ? AND (pr.diagnosis LIKE ? OR ${hasMedicine})
              ORDER BY pr.prescription_date DESC, pr.prescription_id DESC LIMIT ?`, [u.patientId, term, term, LIMIT]))[0].map((x) => ({ ...x, type: "prescription", tab: "rx" })),
        Appointments: async () => (await pool.query(
            `SELECT a.appointment_id AS id, a.reason AS title, CONCAT(DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i'), ' · ', du.name, ' · ', a.status) AS subtitle
               FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id JOIN users du ON du.user_id = d.user_id
              WHERE a.patient_id = ? AND (a.reason LIKE ? OR du.name LIKE ?) ORDER BY a.scheduled_at DESC LIMIT ?`, [u.patientId, term, term, LIMIT]))[0].map((x) => ({ ...x, type: "appointment", tab: "appts" }))
    }),
    DOCTOR: (u, term, raw) => ({
        Patients: async () => (await pool.query(
            `SELECT p.patient_id AS id, uu.name AS title, CONCAT('Patient ID ', p.patient_id, IFNULL(CONCAT(' · ', p.gender), '')) AS subtitle
               FROM patients p JOIN users uu ON uu.user_id = p.user_id
              WHERE uu.is_active = 1 AND (CAST(p.patient_id AS CHAR) = ? OR uu.name LIKE ?) ORDER BY uu.name LIMIT ?`, [raw, term, LIMIT]))[0].map((x) => ({ ...x, type: "patient", tab: "patients" })),
        Prescriptions: async () => (await pool.query(
            `SELECT pr.prescription_id AS id, pr.diagnosis AS title,
                    CONCAT(pu.name, ' · #', pr.prescription_id, ' · ', pr.prescription_date, ' · ', pr.status) AS subtitle
               FROM prescriptions pr JOIN patients p ON p.patient_id = pr.patient_id JOIN users pu ON pu.user_id = p.user_id
              WHERE pr.doctor_id = ? AND (pr.diagnosis LIKE ? OR pu.name LIKE ? OR ${hasMedicine})
              ORDER BY pr.prescription_date DESC, pr.prescription_id DESC LIMIT ?`, [u.doctorId, term, term, term, LIMIT]))[0].map((x) => ({ ...x, type: "prescription", tab: "mine" })),
        Appointments: async () => (await pool.query(
            `SELECT a.appointment_id AS id, pu.name AS title, CONCAT(DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i'), ' · ', a.reason, ' · ', a.status) AS subtitle
               FROM appointments a JOIN patients p ON p.patient_id = a.patient_id JOIN users pu ON pu.user_id = p.user_id
              WHERE a.doctor_id = ? AND (a.reason LIKE ? OR pu.name LIKE ?) ORDER BY a.scheduled_at DESC LIMIT ?`, [u.doctorId, term, term, LIMIT]))[0].map((x) => ({ ...x, type: "appointment", tab: "appts" })),
        Medicines: (tab) => medicines(term).then((r) => r.map((x) => ({ ...x, type: "medicine", tab })))
    }),
    PHARMACY_STAFF: (u, term) => ({
        Stock: async () => (await pool.query(
            `SELECT b.batch_id AS id, CONCAT(m.name, ' ', m.strength) AS title, CONCAT('Batch ', b.batch_number, ' · ', b.quantity, ' in stock · expires ', b.expiry_date) AS subtitle
               FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id
              WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL AND (b.batch_number LIKE ? OR m.name LIKE ? OR m.generic_name LIKE ?) ORDER BY m.name LIMIT ?`, [u.pharmacyId, term, term, term, LIMIT]))[0].map((x) => ({ ...x, type: "batch", tab: "inventory" })),
        Medicines: () => medicines(term).then((r) => r.map((x) => ({ ...x, type: "medicine", tab: "catalog" })))
    }),
    ADMIN: (u, term) => ({
        Users: async () => (await pool.query(
            `SELECT user_id AS id, name AS title, CONCAT(email, ' · ', role, IF(is_active, '', ' · deactivated')) AS subtitle
               FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT ?`, [term, term, LIMIT]))[0].map((x) => ({ ...x, type: "user", tab: "users" })),
        Medicines: () => medicines(term).then((r) => r.map((x) => ({ ...x, type: "medicine", tab: null })))
    })
};

async function search(user, query) {
    const raw = toText(query.q, "q", { min: 2, max: 100 });
    const make = finders[user.role];
    if (!make) return [];
    const groups = make(user, `%${likeEscape(raw)}%`, raw);
    const names = Object.keys(groups);
    const found = await Promise.all(names.map((n) => groups[n](null)));
    return names.map((n, i) => ({ group: n, items: found[i] })).filter((g) => g.items.length);
}

module.exports = { search };
