const pool = require("../config/database");
const { badRequest, notFound } = require("../utils/httpError");
const { likeEscape, pagination, toInt, toText } = require("../utils/validate");

function medicineInput(input) {
    return {
        name: toText(input.name, "name", { max: 150 }), generic_name: toText(input.generic_name, "generic_name", { max: 150 }),
        description: toText(input.description, "description", { max: 10000, required: false }),
        dosage_form: toText(input.dosage_form, "dosage_form", { max: 50 }), strength: toText(input.strength, "strength", { max: 100 }),
        reorder_level: input.reorder_level === undefined ? 20 : toInt(input.reorder_level, "reorder_level", { min: 0 })
    };
}

async function list(query) {
    const { limit, offset, page } = pagination(query);
    // query(), not execute(): MySQL 8.0.22+ rejects numeric LIMIT/OFFSET placeholders in prepared statements.
    const [rows] = await pool.query(
        "SELECT medicine_id, name, generic_name, description, dosage_form, strength, reorder_level, created_at FROM medicines WHERE is_active = 1 ORDER BY name, medicine_id LIMIT ? OFFSET ?", [limit, offset]
    );
    return { items: rows, page, limit };
}

async function getById(id) {
    const [rows] = await pool.execute("SELECT medicine_id, name, generic_name, description, dosage_form, strength, reorder_level, created_at FROM medicines WHERE medicine_id = ? AND is_active = 1", [toInt(id, "medicineId")]);
    if (!rows.length) throw notFound("Medicine not found");
    return rows[0];
}

async function search(query) {
    const q = toText(query.q, "q", { max: 100 });
    const pattern = `%${likeEscape(q)}%`;
    const [rows] = await pool.execute(
        "SELECT medicine_id, name, generic_name, description, dosage_form, strength FROM medicines WHERE is_active = 1 AND (name LIKE ? ESCAPE '\\\\' OR generic_name LIKE ? ESCAPE '\\\\') ORDER BY name LIMIT 50", [pattern, pattern]
    );
    return rows;
}

async function create(input) {
    const m = medicineInput(input);
    const [result] = await pool.execute("INSERT INTO medicines (name, generic_name, description, dosage_form, strength, reorder_level) VALUES (?, ?, ?, ?, ?, ?)", Object.values(m));
    return getById(result.insertId);
}

async function update(id, input) {
    const medicineId = toInt(id, "medicineId");
    await getById(medicineId);
    const m = medicineInput(input);
    await pool.execute("UPDATE medicines SET name = ?, generic_name = ?, description = ?, dosage_form = ?, strength = ?, reorder_level = ? WHERE medicine_id = ?", [...Object.values(m), medicineId]);
    return getById(medicineId);
}

async function remove(id) {
    const medicineId = toInt(id, "medicineId");
    await getById(medicineId);
    const [used] = await pool.execute("SELECT 1 FROM prescription_items WHERE medicine_id = ? LIMIT 1", [medicineId]);
    if (used.length) throw badRequest("Medicine is referenced by prescriptions and cannot be removed");
    await pool.execute("UPDATE medicines SET is_active = 0 WHERE medicine_id = ?", [medicineId]);
}

module.exports = { create, getById, list, remove, search, update };
