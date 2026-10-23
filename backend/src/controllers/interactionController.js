const service = require("../services/interactionService");
async function check(req, res) { res.json({ success: true, message: "Interactions retrieved successfully", data: await service.check(req.query.medicineIds) }); }
async function get(req, res) {
    const id = req.params.medicineId;
    const pool = require("../config/database");
    const [rows] = await pool.execute("SELECT i.interaction_id, i.medicine_id_1, m1.name AS medicine_1, i.medicine_id_2, m2.name AS medicine_2, i.severity, i.description FROM medicine_interactions i JOIN medicines m1 ON m1.medicine_id = i.medicine_id_1 JOIN medicines m2 ON m2.medicine_id = i.medicine_id_2 WHERE i.medicine_id_1 = ? OR i.medicine_id_2 = ?", [id, id]);
    res.json({ success: true, message: "Interactions retrieved successfully", data: rows });
}
module.exports = { check, get };
