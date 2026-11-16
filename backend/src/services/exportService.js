// Exports: a prescription as a printable PDF, a patient's own data (JSON or CSV), and administrator reports (CSV).
// Each export first checks who is asking, only ever reads, and leaves a row in the audit log.
const pool = require("../config/database");
const { badRequest, forbidden } = require("../utils/httpError");
const { toDate, toEnum } = require("../utils/validate");
const { writeAudit } = require("../utils/audit");
const { toCsv } = require("../utils/csv");
const { Pdf } = require("../utils/simplePdf");
const prescriptionService = require("./prescriptionService");

const MAX_ROWS = 50000;        // a cap on any one export, so one request cannot read a whole table into memory
const MAX_AUDIT_ROWS = 20000;
const today = () => new Date().toISOString().slice(0, 10);
const ymd = (v) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const stamp = (v) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : String(v).slice(0, 19));

// ---------------- Prescription PDF ----------------

// prescriptionService.get applies the access rules: the writing doctor, the patient it is for, and pharmacy staff.
// Anyone else gets 404, exactly as when the prescription does not exist.
async function prescriptionPdf(user, prescriptionId, ip) {
    const rx = await prescriptionService.get(prescriptionId, user);
    const [[doctor]] = await pool.query("SELECT license_number, specialization FROM doctors WHERE doctor_id = ?", [rx.doctor_id]);
    const [[patient]] = await pool.query("SELECT date_of_birth FROM patients WHERE patient_id = ?", [rx.patient_id]);

    const pdf = new Pdf({ title: `MedSync prescription #${rx.prescription_id}` });
    pdf.text("MedSync", { size: 11, bold: true, gap: 0 });
    pdf.text(`Prescription #${rx.prescription_id}`, { size: 20, bold: true, gap: 0 });
    pdf.text(`Date: ${ymd(rx.prescription_date)}     Status: ${rx.status}`, { size: 10 });
    if (rx.status === "CANCELLED") pdf.text("THIS PRESCRIPTION HAS BEEN CANCELLED AND MUST NOT BE DISPENSED.", { size: 11, bold: true });
    pdf.rule();

    pdf.text("Prescribed by", { size: 9, bold: true, gap: 0 });
    pdf.text(`Dr. ${rx.doctor_name}${doctor ? `, ${doctor.specialization}` : ""}`, { size: 12, gap: 0 });
    if (doctor) pdf.text(`Licence no. ${doctor.license_number}`, { size: 10 });
    pdf.space(4);
    pdf.text("Patient", { size: 9, bold: true, gap: 0 });
    pdf.text(rx.patient_name, { size: 12, gap: 0 });
    pdf.text(`Patient ID ${rx.patient_id}${patient ? `     Date of birth ${ymd(patient.date_of_birth)}` : ""}`, { size: 10 });
    pdf.space(4);
    if (rx.diagnosis) { pdf.text("Diagnosis", { size: 9, bold: true, gap: 0 }); pdf.text(rx.diagnosis, { size: 11 }); }
    if (rx.notes) { pdf.text("Notes", { size: 9, bold: true, gap: 0 }); pdf.text(rx.notes, { size: 11 }); }
    pdf.rule();

    pdf.text("Medicines", { size: 12, bold: true });
    const cols = [{ title: "Medicine", width: 170 }, { title: "Dosage", width: 90 }, { title: "How often", width: 105 }, { title: "From", width: 65 }, { title: "To", width: 65 }];
    pdf.row(cols.map((c) => ({ text: c.title, width: c.width })), { bold: true });
    for (const item of rx.items) {
        const name = item.generic_name && item.generic_name !== item.medicine_name ? `${item.medicine_name} (${item.generic_name})` : item.medicine_name;
        pdf.row([
            { text: name, width: cols[0].width }, { text: item.dosage, width: cols[1].width }, { text: item.frequency, width: cols[2].width },
            { text: ymd(item.start_date), width: cols[3].width }, { text: ymd(item.end_date), width: cols[4].width }
        ]);
        if (item.instructions) pdf.text(`Instructions: ${item.instructions}`, { size: 9, indent: 8 });
    }

    if (rx.dispensed_at) {
        pdf.space(6);
        pdf.text(`Dispensed ${stamp(rx.dispensed_at)}${rx.dispensed_pharmacy_name ? ` by ${rx.dispensed_pharmacy_name}` : ""}.`, { size: 10 });
    }
    pdf.space(12);
    pdf.rule();
    pdf.text(`Printed from MedSync on ${today()}. Check the status in MedSync before dispensing: a prescription can be cancelled after it is printed.`, { size: 8 });

    await writeAudit({ userId: user.id, action: "PRESCRIPTION_EXPORT", entityType: "prescription", entityId: rx.prescription_id, details: { format: "pdf" }, ip });
    return { buffer: pdf.toBuffer(), contentType: "application/pdf", filename: `medsync-prescription-${rx.prescription_id}.pdf` };
}

// ---------------- A patient's own data ----------------

const PRESCRIPTION_COLUMNS = [
    { key: "prescription_id", label: "Prescription" }, { key: "prescription_date", label: "Date" }, { key: "status", label: "Status" },
    { key: "doctor_name", label: "Doctor" }, { key: "diagnosis", label: "Diagnosis" }, { key: "notes", label: "Notes" },
    { key: "medicine_name", label: "Medicine" }, { key: "strength", label: "Strength" }, { key: "dosage", label: "Dosage" },
    { key: "frequency", label: "How often" }, { key: "start_date", label: "From" }, { key: "end_date", label: "To" }, { key: "instructions", label: "Instructions" }
];
const REMINDER_COLUMNS = [
    { key: "reminder_id", label: "Reminder" }, { key: "prescription_id", label: "Prescription" }, { key: "medicine_name", label: "Medicine" },
    { key: "dosage", label: "Dosage" }, { key: "scheduled_at", label: "Scheduled for" }, { key: "status", label: "Status" }, { key: "status_updated_at", label: "Answered at" }
];

// Everything the signed-in patient has in MedSync. Only their own rows are read: every query is keyed by their patient id,
// which comes from the signed token and never from the request. Other doctors' notes and other patients are not part of it.
async function patientData(user, query, ip) {
    if (!user.patientId) throw forbidden("Only patients can export their own data");
    const format = toEnum(query.format || "json", "format", ["json", "csv"]);
    const part = toEnum(query.part || "prescriptions", "part", ["prescriptions", "reminders"]);
    const pid = user.patientId;

    const [[profile]] = await pool.query(
        `SELECT u.name, u.email, u.phone, p.date_of_birth, p.gender, p.address
           FROM patients p JOIN users u ON u.user_id = p.user_id WHERE p.patient_id = ?`, [pid]);
    const [prescriptions] = await pool.query(
        `SELECT pr.prescription_id, pr.prescription_date, pr.status, pr.diagnosis, pr.notes, du.name AS doctor_name, pr.dispensed_at
           FROM prescriptions pr JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id
          WHERE pr.patient_id = ? ORDER BY pr.prescription_date, pr.prescription_id LIMIT ?`, [pid, MAX_ROWS]);
    const [items] = await pool.query(
        `SELECT pi.prescription_id, pi.prescription_item_id, m.name AS medicine_name, m.strength, pi.dosage, pi.frequency, pi.start_date, pi.end_date, pi.instructions
           FROM prescription_items pi JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pr.patient_id = ? ORDER BY pi.prescription_item_id LIMIT ?`, [pid, MAX_ROWS]);
    const [reminders] = await pool.query(
        `SELECT r.reminder_id, pi.prescription_id, m.name AS medicine_name, pi.dosage, r.scheduled_at, r.status, r.status_updated_at
           FROM reminders r JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pr.patient_id = ? ORDER BY r.scheduled_at, r.reminder_id LIMIT ?`, [pid, MAX_ROWS]);

    await writeAudit({ userId: user.id, action: "PATIENT_DATA_EXPORT", entityType: "patient", entityId: pid, details: { format, part: format === "csv" ? part : "all" }, ip });

    if (format === "json") {
        const body = {
            exported_at: new Date().toISOString(),
            profile,
            prescriptions: prescriptions.map((p) => ({ ...p, items: items.filter((i) => i.prescription_id === p.prescription_id).map(({ prescription_id, ...rest }) => rest) })),
            reminders
        };
        return { buffer: Buffer.from(JSON.stringify(body, null, 2), "utf8"), contentType: "application/json; charset=utf-8", filename: `medsync-my-data-${today()}.json` };
    }
    if (part === "reminders") return { buffer: Buffer.from(toCsv(REMINDER_COLUMNS, reminders), "utf8"), contentType: "text/csv; charset=utf-8", filename: `medsync-my-reminders-${today()}.csv` };
    const byId = new Map(prescriptions.map((p) => [p.prescription_id, p]));
    const rows = items.map((i) => ({ ...byId.get(i.prescription_id), ...i }));
    return { buffer: Buffer.from(toCsv(PRESCRIPTION_COLUMNS, rows), "utf8"), contentType: "text/csv; charset=utf-8", filename: `medsync-my-prescriptions-${today()}.csv` };
}

// ---------------- Administrator reports ----------------

const REPORTS = {
    // Account list for review. The password hash is never selected.
    async users() {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.name, u.email, u.role, u.phone, u.is_active, u.created_at, d.license_number, d.specialization, ph.name AS pharmacy_name
               FROM users u LEFT JOIN doctors d ON d.user_id = u.user_id
               LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id LEFT JOIN pharmacies ph ON ph.pharmacy_id = ps.pharmacy_id
              ORDER BY u.user_id LIMIT ?`, [MAX_ROWS]);
        return { rows: rows.map((r) => ({ ...r, is_active: r.is_active ? "yes" : "no" })), columns: [
            { key: "user_id", label: "User" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "role", label: "Role" },
            { key: "phone", label: "Phone" }, { key: "is_active", label: "Active" }, { key: "created_at", label: "Created" },
            { key: "license_number", label: "Licence" }, { key: "specialization", label: "Specialization" }, { key: "pharmacy_name", label: "Pharmacy" }
        ] };
    },
    // Stock of every pharmacy, with each batch's expiry state.
    async stock() {
        const [rows] = await pool.query(
            `SELECT ph.name AS pharmacy_name, m.name AS medicine_name, m.strength, b.batch_number, b.quantity, b.expiry_date,
                    CASE WHEN b.expiry_date < CURDATE() THEN 'EXPIRED'
                         WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
                         ELSE 'VALID' END AS expiry_status
               FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id JOIN pharmacies ph ON ph.pharmacy_id = b.pharmacy_id
              WHERE b.deleted_at IS NULL ORDER BY ph.name, b.expiry_date, b.batch_id LIMIT ?`, [MAX_ROWS]);
        return { rows, columns: [
            { key: "pharmacy_name", label: "Pharmacy" }, { key: "medicine_name", label: "Medicine" }, { key: "strength", label: "Strength" },
            { key: "batch_number", label: "Batch" }, { key: "quantity", label: "Quantity" }, { key: "expiry_date", label: "Expiry date" }, { key: "expiry_status", label: "Expiry status" }
        ] };
    },
    // Who did what and when. The free-text "details" are left out on purpose: they can hold clinical wording
    // (for example a doctor's reason for overriding an interaction warning) that an account administrator does not need.
    async audit(query) {
        const to = query.to ? toDate(query.to, "to") : today();
        const from = query.from ? toDate(query.from, "from") : ymd(new Date(Date.now() - 30 * 86400000));
        if (from > to) throw badRequest("from cannot be after to");
        const [rows] = await pool.query(
            `SELECT a.audit_id, a.created_at, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_id, a.ip_address
               FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
              WHERE a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)
              ORDER BY a.audit_id LIMIT ?`, [from, to, MAX_AUDIT_ROWS + 1]);
        if (rows.length > MAX_AUDIT_ROWS) throw badRequest(`More than ${MAX_AUDIT_ROWS} audit entries in that period. Choose a shorter date range.`);
        return { rows, columns: [
            { key: "audit_id", label: "Entry" }, { key: "created_at", label: "Time" }, { key: "user_id", label: "User" }, { key: "user_name", label: "Name" },
            { key: "action", label: "Action" }, { key: "entity_type", label: "Record type" }, { key: "entity_id", label: "Record" }, { key: "ip_address", label: "IP address" }
        ], period: `${from}_to_${to}` };
    }
};

async function adminReport(user, report, query, ip) {
    const name = toEnum(report, "report", Object.keys(REPORTS));
    const { rows, columns, period } = await REPORTS[name](query);
    await writeAudit({ userId: user.id, action: "ADMIN_EXPORT", entityType: "report", details: { report: name, rows: rows.length, ...(period ? { period } : {}) }, ip });
    const csv = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? stamp(v) : v])));
    return { buffer: Buffer.from(toCsv(columns, csv), "utf8"), contentType: "text/csv; charset=utf-8", filename: `medsync-${name}-${period || today()}.csv` };
}

module.exports = { adminReport, patientData, prescriptionPdf };
