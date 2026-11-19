const pool = require("../config/database");
const { badRequest } = require("../utils/httpError");
const { addDays, toDate, todayString } = require("../utils/validate");
const { buildCalendar } = require("../utils/ics");
const { writeAudit } = require("../utils/audit");

const MAX_DAYS = 62; // a month view with its leading and trailing days is at most 42

// Everything a patient needs to draw a calendar for [from, to]: doses, appointments and course start/end dates.
// Read-only and limited to the signed-in patient. Answering a dose is done with the existing reminder endpoint.
async function patientCalendar(patientId, query) {
    const from = toDate(query.from, "from");
    const to = toDate(query.to, "to");
    if (to < from) throw badRequest("to must not be before from");
    if (addDays(from, MAX_DAYS - 1) < to) throw badRequest(`Ask for at most ${MAX_DAYS} days at a time`);

    const [reminders] = await pool.execute(
        `SELECT r.reminder_id, DATE_FORMAT(r.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_at, r.status,
                pi.prescription_item_id, pr.prescription_id, m.name AS medicine_name, pi.dosage
           FROM reminders r
           JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status IN ('ACTIVE', 'DISPENSED')
           JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pr.patient_id = ? AND r.scheduled_at >= ? AND r.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)
          ORDER BY r.scheduled_at, r.reminder_id LIMIT 2000`,
        [patientId, from, to]
    );

    const [appointments] = await pool.execute(
        `SELECT a.appointment_id, DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_at, a.status, a.reason,
                du.name AS doctor_name, d.specialization
           FROM appointments a
           JOIN doctors d ON d.doctor_id = a.doctor_id JOIN users du ON du.user_id = d.user_id
          WHERE a.patient_id = ? AND a.scheduled_at >= ? AND a.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)
          ORDER BY a.scheduled_at, a.appointment_id LIMIT 500`,
        [patientId, from, to]
    );

    const [courses] = await pool.execute(
        `SELECT pi.prescription_item_id, pr.prescription_id, m.name AS medicine_name, pi.dosage,
                DATE_FORMAT(pi.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(pi.end_date, '%Y-%m-%d') AS end_date
           FROM prescription_items pi
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status IN ('ACTIVE', 'DISPENSED')
           JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pr.patient_id = ? AND pi.start_date <= ? AND pi.end_date >= ?
          ORDER BY pi.start_date, pi.prescription_item_id LIMIT 500`,
        [patientId, to, from]
    );

    return { from, to, reminders, appointments, courses };
}

function range(query) {
    const from = toDate(query.from, "from");
    const to = toDate(query.to, "to");
    if (to < from) throw badRequest("to must not be before from");
    if (addDays(from, MAX_DAYS - 1) < to) throw badRequest(`Ask for at most ${MAX_DAYS} days at a time`);
    return { from, to };
}

const pad = (n) => String(n).padStart(2, "0");
function nowString() {
    const d = new Date();
    return `${todayString()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Upcoming pending doses and open appointments as an .ics file (default: today + 60 days).
async function patientIcs(user, query, ip) {
    const from = query.from ? toDate(query.from, "from") : todayString();
    const to = query.to ? toDate(query.to, "to") : addDays(from, MAX_DAYS - 1);
    const cal = await patientCalendar(user.patientId, { from, to });
    const now = nowString();
    const events = [];
    for (const r of cal.reminders) {
        if (r.status !== "PENDING" || r.scheduled_at < now) continue;
        events.push({ uid: `dose-${r.reminder_id}`, start: r.scheduled_at, minutes: 15, summary: `Take ${r.medicine_name}`, description: r.dosage ? `Dosage: ${r.dosage}` : "", alarmMinutes: 0 });
    }
    for (const a of cal.appointments) {
        if (!["REQUESTED", "CONFIRMED"].includes(a.status) || a.scheduled_at < now) continue;
        events.push({ uid: `appt-${a.appointment_id}`, start: a.scheduled_at, minutes: 30, summary: `Appointment with Dr. ${a.doctor_name}${a.status === "REQUESTED" ? " (awaiting confirmation)" : ""}`, description: a.reason || "", alarmMinutes: 60 });
    }
    await writeAudit({ userId: user.id, action: "CALENDAR_EXPORT", entityType: "patient", entityId: user.patientId, details: { from, to, events: events.length }, ip });
    return { filename: `medsync-calendar-${from}.ics`, contentType: "text/calendar; charset=utf-8", buffer: Buffer.from(buildCalendar(events), "utf8") };
}

// A doctor's appointments plus the dates their prescribed courses end (natural follow-up points).
async function doctorCalendar(doctorId, query) {
    const { from, to } = range(query);
    const [appointments] = await pool.execute(
        `SELECT a.appointment_id, DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_at, a.status, a.reason,
                pu.name AS patient_name, a.patient_id
           FROM appointments a
           JOIN patients p ON p.patient_id = a.patient_id JOIN users pu ON pu.user_id = p.user_id
          WHERE a.doctor_id = ? AND a.scheduled_at >= ? AND a.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)
          ORDER BY a.scheduled_at, a.appointment_id LIMIT 500`,
        [doctorId, from, to]
    );
    const [followups] = await pool.execute(
        `SELECT pr.prescription_id, pr.patient_id, pu.name AS patient_name, m.name AS medicine_name,
                DATE_FORMAT(pi.end_date, '%Y-%m-%d') AS end_date
           FROM prescription_items pi
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id AND pr.status IN ('ACTIVE', 'DISPENSED')
           JOIN patients p ON p.patient_id = pr.patient_id JOIN users pu ON pu.user_id = p.user_id
           JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pr.doctor_id = ? AND pi.end_date >= ? AND pi.end_date <= ?
          ORDER BY pi.end_date, pr.prescription_id LIMIT 500`,
        [doctorId, from, to]
    );
    return { from, to, appointments, followups };
}

// Batches of one pharmacy that expire in [from, to] and still have stock.
async function stockCalendar(pharmacyId, query) {
    const { from, to } = range(query);
    const [batches] = await pool.execute(
        `SELECT b.batch_id, b.batch_number, b.quantity, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date, m.name AS medicine_name, m.strength
           FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id
          WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL AND b.quantity > 0 AND b.expiry_date >= ? AND b.expiry_date <= ?
          ORDER BY b.expiry_date, m.name LIMIT 1000`,
        [pharmacyId, from, to]
    );
    return { from, to, today: todayString(), batches };
}

module.exports = { patientCalendar, patientIcs, doctorCalendar, stockCalendar };
