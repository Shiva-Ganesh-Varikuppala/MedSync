const pool = require("../config/database");
const { toInt } = require("../utils/validate");
const { notFound, badRequest } = require("../utils/httpError");
const messageSender = require("./messageSender");

async function dispatch({ userId, reminderId = null, channel = "EMAIL", recipient, title, message }) {
    let status = "SENT";
    let errorMessage = null;

    try {
        if (channel === "EMAIL") {
            if (messageSender.emailConfigured()) await messageSender.sendEmail({ to: recipient, subject: title, text: message });
            else if (process.env.NODE_ENV !== "test") console.log(`[Notification/EMAIL] (not sent, email is not set up) To: ${recipient} | Subject: ${title}`);
        } else if (channel === "SMS") {
            if (messageSender.smsConfigured()) await messageSender.sendSms({ to: recipient, text: `${title}: ${message}` });
            else if (process.env.NODE_ENV !== "test") console.log(`[Notification/SMS] (not sent, SMS is not set up) To: ${recipient}`);
        }
    } catch (err) {
        status = "FAILED";
        errorMessage = String(err.message || err).slice(0, 500);
    }

    const [res] = await pool.execute(
        `INSERT INTO notifications (user_id, reminder_id, channel, recipient, title, message, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, reminderId, channel, recipient || "unknown", title, message, status, errorMessage]
    );

    return {
        notification_id: res.insertId,
        user_id: userId,
        reminder_id: reminderId,
        channel,
        recipient,
        title,
        message,
        status,
        sent_at: new Date().toISOString()
    };
}

async function notifyReminder(reminderId, channels = ["EMAIL"], patientId = null) {
    const rId = toInt(reminderId, "reminderId");
    if (!Array.isArray(channels) || !channels.length || channels.some((c) => !["EMAIL", "SMS"].includes(c))) throw badRequest("channels must be a list of EMAIL and/or SMS");
    const [rows] = await pool.execute(
        `SELECT r.reminder_id, r.scheduled_at, r.status,
                u.user_id, u.name AS patient_name, u.email, u.phone,
                m.name AS medicine_name, pi.dosage, pi.frequency
           FROM reminders r
           JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id
           JOIN patients p ON p.patient_id = pr.patient_id
           JOIN users u ON u.user_id = p.user_id
           JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE r.reminder_id = ?${patientId ? " AND pr.patient_id = ?" : ""}`,
        patientId ? [rId, patientId] : [rId]
    );

    if (!rows.length) throw notFound("Reminder not found");
    const r = rows[0];

    const title = `MedSync Reminder: ${r.medicine_name}`;
    const message = `Hello ${r.patient_name}, this is your medication reminder to take ${r.dosage} of ${r.medicine_name} (${r.frequency}). Scheduled time: ${r.scheduled_at}.`;

    const dispatched = [];
    for (const ch of channels) {
        if (ch === "SMS" && !r.phone && messageSender.smsConfigured()) continue; // no number on file: nothing to send
        const recipient = ch === "SMS" ? r.phone || r.email : r.email;
        const out = await dispatch({
            userId: r.user_id,
            reminderId: r.reminder_id,
            channel: ch,
            recipient,
            title,
            message
        });
        dispatched.push(out);
    }

    return dispatched;
}

async function listForUser(userId, limit = 50) {
    const [rows] = await pool.execute(
        `SELECT notification_id, reminder_id, channel, recipient, title, message, status, sent_at
           FROM notifications
          WHERE user_id = ?
          ORDER BY sent_at DESC, notification_id DESC
          LIMIT ?`,
        [toInt(userId, "userId"), Math.min(100, Math.max(1, Number(limit) || 50))]
    );
    return rows;
}

module.exports = {
    dispatch,
    listForUser,
    notifyReminder
};
