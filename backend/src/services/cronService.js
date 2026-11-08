const pool = require("../config/database");
const notificationService = require("./notificationService");
const messageSender = require("./messageSender");

/**
 * Automatically marks pending reminders as MISSED if their scheduled time has passed
 * beyond the grace period (default 2 hours).
 */
async function processOverdueReminders(graceHours = 2) {
    const hours = Math.max(0.5, Number(graceHours) || 2);
    const [result] = await pool.execute(
        `UPDATE reminders
            SET status = 'MISSED', status_updated_at = NOW()
          WHERE status = 'PENDING'
            AND scheduled_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [hours]
    );
    return {
        transitioned_to_missed_count: result.affectedRows
    };
}

/**
 * Finds reminders scheduled around now that have not been notified yet,
 * and actively delivers notifications to the patient.
 */
async function dispatchDueReminders(lookaheadMinutes = 30) {
    const minutes = Math.max(5, Number(lookaheadMinutes) || 30);
    const [rows] = await pool.execute(
        `SELECT r.reminder_id
           FROM reminders r
           JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id
          WHERE pr.status IN ('ACTIVE', 'DISPENSED')
            AND r.status = 'PENDING'
            AND r.scheduled_at BETWEEN DATE_SUB(NOW(), INTERVAL 15 MINUTE) AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
            AND NOT EXISTS (
                SELECT 1 FROM notifications n WHERE n.reminder_id = r.reminder_id
            )
          LIMIT 100`,
        [minutes]
    );

    let dispatched = 0;
    for (const row of rows) {
        try {
            await notificationService.notifyReminder(row.reminder_id, messageSender.smsConfigured() ? ["EMAIL", "SMS"] : ["EMAIL"]);
            dispatched++;
        } catch (e) {
            console.error(`Failed to dispatch reminder #${row.reminder_id}:`, e.message);
        }
    }

    return {
        reminders_dispatched_count: dispatched
    };
}

/**
 * Runs all automated maintenance & dispatch tasks in one cycle.
 */
async function runAllCronTasks() {
    const overdue = await processOverdueReminders();
    const dispatch = await dispatchDueReminders();
    return {
        timestamp: new Date().toISOString(),
        ...overdue,
        ...dispatch
    };
}

let cronTimer = null;

function startCronWorker(intervalMs = 60000) {
    if (cronTimer) return;
    cronTimer = setInterval(async () => {
        try {
            await runAllCronTasks();
        } catch (err) {
            console.error("Cron cycle error:", err.message);
        }
    }, intervalMs);
    if (cronTimer.unref) cronTimer.unref();
}

function stopCronWorker() {
    if (cronTimer) {
        clearInterval(cronTimer);
        cronTimer = null;
    }
}

module.exports = {
    dispatchDueReminders,
    processOverdueReminders,
    runAllCronTasks,
    startCronWorker,
    stopCronWorker
};
