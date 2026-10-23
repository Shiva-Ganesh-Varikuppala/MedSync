const pool = require("../config/database");
const { toInt } = require("../utils/validate");
const { notFound } = require("../utils/httpError");

async function dispatch({ userId, reminderId = null, channel = "EMAIL", recipient, title, message }) {
    let status = "SENT";
    let errorMessage = null;

    try {
        if (channel === "EMAIL") {
            // If custom SMTP is configured, we can send real emails; otherwise log in development
            if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                // In production, integrate nodemailer transport here
            } else {
                // Console trace in development
                if (process.env.NODE_ENV !== "test") {
                    console.log(`[Notification/EMAIL] To: ${recipient} | Subject: ${title} | Body: ${message}`);
                }
            }
        } else if (channel === "SMS") {
            if (process.env.NODE_ENV !== "test") {
                console.log(`[Notification/SMS] To: ${recipient} | Text: ${message}`);
            }
        }
    } catch (err) {
        status = "FAILED";
        errorMessage = err.message;
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

async function notifyReminder(reminderId, channels = ["EMAIL"]) {
    const rId = toInt(reminderId, "reminderId");
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
          WHERE r.reminder_id = ?`,
        [rId]
    );

    if (!rows.length) throw notFound("Reminder not found");
    const r = rows[0];

    const title = `MedSync Reminder: ${r.medicine_name}`;
    const message = `Hello ${r.patient_name}, this is your medication reminder to take ${r.dosage} of ${r.medicine_name} (${r.frequency}). Scheduled time: ${r.scheduled_at}.`;

    const dispatched = [];
    for (const ch of channels) {
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
