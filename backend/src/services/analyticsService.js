const pool = require("../config/database");
const blobStore = require("./blobStore");

const pad = (n) => String(n).padStart(2, "0");

// Numbers for the admin Analytics tab. Adherence and stock come from the SQL views (database/migrations/010).
async function overview() {
    const [months] = await pool.query(
        `SELECT DATE_FORMAT(prescription_date, '%Y-%m') AS ym, COUNT(*) AS n FROM prescriptions
          WHERE prescription_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) GROUP BY ym`);
    const byMonth = new Map(months.map((r) => [r.ym, Number(r.n)]));
    const now = new Date(), prescriptions_by_month = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        prescriptions_by_month.push({ month: ym, count: byMonth.get(ym) || 0 });
    }
    const [reminders] = await pool.query("SELECT status, COUNT(*) AS n FROM reminders GROUP BY status");
    const [appointments] = await pool.query("SELECT status, COUNT(*) AS n FROM appointments GROUP BY status");
    const [adherence] = await pool.query(
        `SELECT patient_name, taken, skipped, missed, pending, adherence_pct FROM v_patient_adherence
          ORDER BY adherence_pct IS NULL, adherence_pct, patient_name LIMIT 10`);
    const [stock] = await pool.query(
        "SELECT pharmacy_name, medicine_name, units_in_stock, nearest_expiry FROM v_pharmacy_stock ORDER BY units_in_stock, medicine_name LIMIT 8");
    const [[files]] = await pool.query("SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM prescription_attachments");
    const count = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], Number(r.n)]));
    const rem = count(reminders, "status");
    const answered = (rem.TAKEN || 0) + (rem.SKIPPED || 0) + (rem.MISSED || 0);
    return {
        prescriptions_by_month,
        reminders: rem,
        overall_adherence_pct: answered ? Math.round((1000 * (rem.TAKEN || 0)) / answered) / 10 : null,
        appointments: count(appointments, "status"),
        adherence: adherence.map((r) => ({ ...r, taken: Number(r.taken), skipped: Number(r.skipped), missed: Number(r.missed), pending: Number(r.pending), adherence_pct: r.adherence_pct === null ? null : Number(r.adherence_pct) })),
        low_stock: stock.map((r) => ({ ...r, units_in_stock: Number(r.units_in_stock) })),
        files: { count: Number(files.n), bytes: Number(files.bytes), storage: blobStore.status() }
    };
}

module.exports = { overview };
