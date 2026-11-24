const pool = require("../config/database");
const F = require("../ml/adherenceFeatures");

// Adherence risk: reads reminder history, trains / applies the model in src/ml, and keeps the latest score per patient.
// The score is advisory. It never changes a prescription or a reminder.

const STALE_HOURS = 6;      // a doctor's list is rescored when a patient's score is older than this
const HISTORY_DAYS = 180;
const json = (v) => (typeof v === "string" ? JSON.parse(v) : v);   // MySQL returns JSON columns parsed, MariaDB as text

async function dbNow() {
    const [[r]] = await pool.query("SELECT NOW() AS n");
    return F.parseTs(r.n);
}
function ageAt(dob, nowMs) {
    const born = F.parseTs(`${String(dob).slice(0, 10)} 00:00:00`);
    return born === null ? 40 : Math.max(0, Math.floor((nowMs - born) / (365.25 * 864e5)));
}

// patient_id -> [doses] from the last 180 days, oldest first. patientIds = null means everyone.
async function loadDoses(patientIds = null) {
    if (patientIds && !patientIds.length) return new Map();
    const params = [HISTORY_DAYS];
    let filter = "";
    if (patientIds) { filter = "AND pr.patient_id IN (?)"; params.push(patientIds); }
    const [rows] = await pool.query(
        `SELECT pr.patient_id, r.prescription_item_id, r.scheduled_at, r.status, r.status_updated_at
           FROM reminders r
           JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
           JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id
          WHERE r.scheduled_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filter}
          ORDER BY pr.patient_id, r.scheduled_at`, params);
    const byPatient = new Map();
    for (const r of rows) {
        if (!byPatient.has(r.patient_id)) byPatient.set(r.patient_id, []);
        byPatient.get(r.patient_id).push({
            t: F.parseTs(r.scheduled_at), status: r.status, item: r.prescription_item_id,
            answered: r.status === "PENDING" || !r.status_updated_at ? null : F.parseTs(r.status_updated_at)
        });
    }
    return byPatient;
}

async function latestModel() {
    const [rows] = await pool.query("SELECT model_id, trained_at, model, metrics FROM risk_models ORDER BY model_id DESC LIMIT 1");
    if (!rows.length) return { id: null, source: "starter", trainedAt: null, model: F.STARTER, metrics: null };
    return { id: rows[0].model_id, source: "trained", trainedAt: rows[0].trained_at, model: json(rows[0].model), metrics: json(rows[0].metrics) };
}
const describe = (m) => ({ source: m.source, trained_at: m.trainedAt, metrics: m.metrics });

// Admin: what model is in use and how well it did when it was tested.
async function modelOverview() {
    const m = await latestModel();
    const [[count]] = await pool.query("SELECT COUNT(*) AS n FROM risk_models");
    const [[answered]] = await pool.query("SELECT COUNT(*) AS n FROM reminders WHERE status IN ('TAKEN','SKIPPED','MISSED')");
    return { ...describe(m), trained_models: Number(count.n), answered_reminders: Number(answered.n), min_examples: F.MIN_SAMPLES, horizon_days: F.HORIZON_DAYS };
}

// Learns a new model from all reminder history and tests it on the most recent weeks. A model that cannot be tested honestly is not saved.
async function trainModel(userId = null) {
    const history = await loadDoses(null);
    const [pts] = await pool.query("SELECT patient_id, date_of_birth FROM patients");
    const now = await dbNow();
    const patients = pts.filter((p) => history.has(p.patient_id)).map((p) => ({ doses: history.get(p.patient_id), ageYears: ageAt(p.date_of_birth, now) }));
    const result = F.trainFromPatients(patients);
    if (!result.ok) return { trained: false, reason: result.reason };
    const [ins] = await pool.query("INSERT INTO risk_models (trained_by, model, metrics) VALUES (?, ?, ?)", [userId, JSON.stringify(result.model), JSON.stringify(result.metrics)]);
    await pool.query("DELETE FROM patient_risk");   // old scores belong to the old model; they are rebuilt when a doctor opens the list
    return { trained: true, model_id: ins.insertId, metrics: result.metrics };
}

async function scorePatients(patientIds, info) {
    if (!patientIds.length) return;
    const history = await loadDoses(patientIds);
    const [pts] = await pool.query("SELECT patient_id, date_of_birth FROM patients WHERE patient_id IN (?)", [patientIds]);
    const now = await dbNow();
    for (const p of pts) {
        const s = F.scorePatient(info.model, history.get(p.patient_id) || [], now, ageAt(p.date_of_birth, now));
        await pool.query(
            `INSERT INTO patient_risk (patient_id, model_id, risk, level, reasons, adherence_7, adherence_30, answered_30, scored_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE model_id = VALUES(model_id), risk = VALUES(risk), level = VALUES(level), reasons = VALUES(reasons),
               adherence_7 = VALUES(adherence_7), adherence_30 = VALUES(adherence_30), answered_30 = VALUES(answered_30), scored_at = NOW()`,
            [p.patient_id, info.id, s.risk, s.level, JSON.stringify(s.reasons), s.adherence7, s.adherence30, s.answered30]);
    }
}

// Doctor: the doctor's own patients with a current prescription, highest risk first.
async function atRiskForDoctor(doctorId) {
    const info = await latestModel();
    const [mine] = await pool.query(
        `SELECT DISTINCT pr.patient_id
           FROM prescriptions pr
           JOIN patients p ON p.patient_id = pr.patient_id
           JOIN users u ON u.user_id = p.user_id AND u.is_active = 1
          WHERE pr.doctor_id = ? AND pr.status IN ('ACTIVE', 'DISPENSED')
            AND EXISTS (SELECT 1 FROM prescription_items pi WHERE pi.prescription_id = pr.prescription_id AND pi.end_date >= CURDATE())`, [doctorId]);
    const ids = mine.map((r) => r.patient_id);
    const summary = { high: 0, medium: 0, low: 0, unknown: 0 };
    if (!ids.length) return { model: describe(info), summary, items: [] };

    const [fresh] = await pool.query(
        `SELECT patient_id FROM patient_risk
          WHERE patient_id IN (?) AND scored_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND model_id <=> ?`, [ids, STALE_HOURS, info.id]);
    const have = new Set(fresh.map((r) => r.patient_id));
    await scorePatients(ids.filter((id) => !have.has(id)), info);

    const [rows] = await pool.query(
        `SELECT pr.patient_id, u.name, pr.risk, pr.level, pr.reasons, pr.adherence_7, pr.adherence_30, pr.answered_30, pr.scored_at
           FROM patient_risk pr
           JOIN patients p ON p.patient_id = pr.patient_id
           JOIN users u ON u.user_id = p.user_id
          WHERE pr.patient_id IN (?)
          ORDER BY pr.risk IS NULL, pr.risk DESC, u.name`, [ids]);
    const items = rows.map((r) => {
        summary[r.level.toLowerCase()]++;
        return {
            patient_id: r.patient_id, name: r.name, level: r.level,
            risk: r.risk === null ? null : Number(r.risk),
            reasons: json(r.reasons) || [],
            adherence_7: r.adherence_7 === null ? null : Number(r.adherence_7),
            adherence_30: r.adherence_30 === null ? null : Number(r.adherence_30),
            answered_30: Number(r.answered_30), scored_at: r.scored_at
        };
    });
    return { model: describe(info), summary, items };
}

module.exports = { atRiskForDoctor, latestModel, loadDoses, modelOverview, scorePatients, trainModel, ageAt, dbNow };
