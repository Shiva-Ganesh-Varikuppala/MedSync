const pool = require("../config/database");
const { badRequest } = require("../utils/httpError");
const { toInt } = require("../utils/validate");

async function check(values) {
    if (!values) throw badRequest("medicineIds is required");
    const ids = [...new Set(String(values).split(",").map(v => toInt(v.trim(), "medicineIds")))];
    if (ids.length < 2) throw badRequest("medicineIds must contain at least two distinct medicine IDs");
    const marks = ids.map(() => "?").join(",");
    const [rows] = await pool.execute(
        `SELECT i.interaction_id, i.medicine_id_1, m1.name AS medicine_1, i.medicine_id_2, m2.name AS medicine_2, i.severity, i.description
           FROM medicine_interactions i JOIN medicines m1 ON m1.medicine_id = i.medicine_id_1 JOIN medicines m2 ON m2.medicine_id = i.medicine_id_2
          WHERE i.medicine_id_1 IN (${marks}) AND i.medicine_id_2 IN (${marks}) AND i.medicine_id_1 <> i.medicine_id_2
          ORDER BY i.severity DESC, i.interaction_id`, [...ids, ...ids]
    );
    const seen = new Set();
    return rows.filter(r => { const key = [r.medicine_id_1, r.medicine_id_2].sort((a, b) => a - b).join(":"); if (seen.has(key)) return false; seen.add(key); return true; });
}
async function forMedicine(id) { return check(`${toInt(id, "medicineId")},${toInt(id, "medicineId")}`); }
module.exports = { check, forMedicine };
