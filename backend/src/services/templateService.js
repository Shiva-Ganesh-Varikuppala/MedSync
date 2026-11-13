const pool = require("../config/database");
const { badRequest, conflict, forbidden, notFound } = require("../utils/httpError");
const { toInt, toText } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { writeAudit } = require("../utils/audit");

const MAX_TEMPLATES = 50;   // per doctor
const MAX_ITEMS = 20;       // medicines per template

function itemInput(item) {
    if (!item || typeof item !== "object") throw badRequest("items[] must be objects");
    return [
        toInt(item.medicine_id, "items[].medicine_id"),
        toText(item.dosage, "items[].dosage", { max: 100 }),
        toInt(item.frequency_per_day, "items[].frequency_per_day", { min: 1, max: 6 }),
        toInt(item.duration_days, "items[].duration_days", { min: 1, max: 365 }),
        toText(item.instructions, "items[].instructions", { max: 5000, required: false })
    ];
}

// Every template of one doctor, each with its medicines (name and strength, and whether the medicine is still in use).
async function list(doctorId) {
    if (!doctorId) throw forbidden("Only doctors have templates");
    const [templates] = await pool.execute("SELECT template_id, name, diagnosis, notes, created_at FROM prescription_templates WHERE doctor_id = ? ORDER BY name", [doctorId]);
    if (!templates.length) return [];
    const [items] = await pool.execute(
        `SELECT i.template_id, i.template_item_id, i.medicine_id, m.name AS medicine_name, m.strength, m.is_active,
                i.dosage, i.frequency_per_day, i.duration_days, i.instructions
           FROM prescription_template_items i
           JOIN prescription_templates t ON t.template_id = i.template_id
           JOIN medicines m ON m.medicine_id = i.medicine_id
          WHERE t.doctor_id = ?
          ORDER BY i.template_item_id`,
        [doctorId]
    );
    return templates.map((t) => ({ ...t, items: items.filter((i) => i.template_id === t.template_id).map(({ template_id, ...rest }) => ({ ...rest, is_active: Boolean(rest.is_active) })) }));
}

async function create(doctorId, input, ctx = {}) {
    if (!doctorId) throw forbidden("Only doctors can create templates");
    const name = toText(input.name, "name", { max: 100 });
    const diagnosis = toText(input.diagnosis, "diagnosis", { max: 255, required: false });
    const notes = toText(input.notes, "notes", { max: 5000, required: false });
    if (!Array.isArray(input.items) || !input.items.length) throw badRequest("items must contain at least one medicine");
    if (input.items.length > MAX_ITEMS) throw badRequest(`A template can hold at most ${MAX_ITEMS} medicines`);
    const items = input.items.map(itemInput);

    return withTransaction(async (conn) => {
        const [[count]] = await conn.execute("SELECT COUNT(*) AS n FROM prescription_templates WHERE doctor_id = ? FOR UPDATE", [doctorId]);
        if (count.n >= MAX_TEMPLATES) throw conflict(`You can keep at most ${MAX_TEMPLATES} templates. Delete one first.`);
        const [dupe] = await conn.execute("SELECT 1 FROM prescription_templates WHERE doctor_id = ? AND name = ?", [doctorId, name]);
        if (dupe.length) throw conflict("You already have a template with that name");

        const ids = [...new Set(items.map((i) => i[0]))];
        const [found] = await conn.execute(`SELECT medicine_id FROM medicines WHERE is_active = 1 AND medicine_id IN (${ids.map(() => "?").join(",")})`, ids);
        if (found.length !== ids.length) throw badRequest("One or more medicines do not exist or are inactive");

        const [header] = await conn.execute("INSERT INTO prescription_templates (doctor_id, name, diagnosis, notes) VALUES (?, ?, ?, ?)", [doctorId, name, diagnosis, notes]);
        await conn.query("INSERT INTO prescription_template_items (template_id, medicine_id, dosage, frequency_per_day, duration_days, instructions) VALUES ?", [items.map((i) => [header.insertId, ...i])]);
        await writeAudit({ userId: ctx.userId, action: "TEMPLATE_CREATE", entityType: "prescription_template", entityId: header.insertId, details: { name, items: items.length }, ip: ctx.ip }, conn);
        return header.insertId;
    });
}

// A template of another doctor looks exactly like one that does not exist.
async function remove(doctorId, templateId, ctx = {}) {
    if (!doctorId) throw forbidden("Only doctors can delete templates");
    const id = toInt(templateId, "templateId");
    return withTransaction(async (conn) => {
        const [rows] = await conn.execute("SELECT name FROM prescription_templates WHERE template_id = ? AND doctor_id = ? FOR UPDATE", [id, doctorId]);
        if (!rows.length) throw notFound("Template not found");
        await conn.execute("DELETE FROM prescription_templates WHERE template_id = ?", [id]); // its items go with it (ON DELETE CASCADE)
        await writeAudit({ userId: ctx.userId, action: "TEMPLATE_DELETE", entityType: "prescription_template", entityId: id, details: { name: rows[0].name }, ip: ctx.ip }, conn);
    });
}

module.exports = { create, list, remove };
