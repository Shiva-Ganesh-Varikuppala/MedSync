const pool = require("../config/database");
const { badRequest, forbidden, notFound } = require("../utils/httpError");
const { likeEscape, pagination, toDate, toInt, toText } = require("../utils/validate");
const { withTransaction } = require("../utils/transaction");
const { writeAudit } = require("../utils/audit");

const courseDays = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

async function staffPharmacy(user) {
    if (!user.pharmacyId) throw forbidden("Only pharmacy staff may manage inventory");
    return user.pharmacyId;
}

async function pharmacies() {
    const [r] = await pool.execute("SELECT pharmacy_id, name, address, phone, email FROM pharmacies ORDER BY name");
    return r;
}

async function pharmacy(id) {
    const [r] = await pool.execute("SELECT pharmacy_id, name, address, phone, email FROM pharmacies WHERE pharmacy_id = ?", [toInt(id, "pharmacyId")]);
    if (!r.length) throw notFound("Pharmacy not found");
    return r[0];
}

async function inventory(user, id) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const [r] = await pool.execute(
        `SELECT b.batch_id, b.batch_number, b.quantity, b.expiry_date, m.medicine_id, m.name, m.generic_name,
                CASE WHEN b.expiry_date < CURDATE() THEN 'EXPIRED'
                     WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
                     ELSE 'VALID' END AS inventory_status
           FROM medicine_batches b
           JOIN medicines m ON m.medicine_id = b.medicine_id
          WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL
          ORDER BY b.expiry_date`,
        [pharmacyId]
    );
    return r;
}

// Paged inventory for the screen: one page of batches (optionally filtered by text) plus totals for ALL batches,
// so the summary tiles and chart stay correct however many batches the pharmacy holds.
async function inventoryPage(user, id, query = {}) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const { limit, offset } = pagination(query, { defaultLimit: 20, maxLimit: 50 });
    const q = query.q ? toText(query.q, "q", { max: 100 }) : null;
    const where = ["b.pharmacy_id = ?", "b.deleted_at IS NULL"]; const params = [pharmacyId];
    if (q) { const t = `%${likeEscape(q)}%`; where.push("(m.name LIKE ? OR m.generic_name LIKE ? OR b.batch_number LIKE ?)"); params.push(t, t, t); }
    const [rows] = await pool.query(
        `SELECT b.batch_id, b.batch_number, b.quantity, b.expiry_date, m.medicine_id, m.name, m.generic_name,
                CASE WHEN b.expiry_date < CURDATE() THEN 'EXPIRED'
                     WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
                     ELSE 'VALID' END AS inventory_status
           FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id
          WHERE ${where.join(" AND ")} ORDER BY b.expiry_date, b.batch_id LIMIT ? OFFSET ?`,
        [...params, limit + 1, offset]
    );
    const [[totals]] = await pool.query(
        `SELECT COUNT(*) AS batches,
                COALESCE(SUM(b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0) AS expiring_soon,
                COALESCE(SUM(b.expiry_date < CURDATE()), 0) AS expired
           FROM medicine_batches b WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL`, [pharmacyId]
    );
    const [top] = await pool.query(
        `SELECT m.name, SUM(b.quantity) AS units
           FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id
          WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL AND b.expiry_date >= CURDATE()
          GROUP BY m.medicine_id, m.name ORDER BY units DESC LIMIT 6`, [pharmacyId]
    );
    return {
        rows: rows.slice(0, limit),
        meta: {
            has_more: rows.length > limit,
            summary: { batches: Number(totals.batches), expiring_soon: Number(totals.expiring_soon), expired: Number(totals.expired), stock_by_medicine: top.map((t) => ({ name: t.name, units: Number(t.units) })) }
        }
    };
}

function batchInput(x) {
    return [toInt(x.medicine_id, "medicine_id"), toText(x.batch_number, "batch_number", { max: 100 }), toInt(x.quantity, "quantity", { min: 0 }), toDate(x.expiry_date, "expiry_date")];
}

async function createBatch(user, id, input) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only manage your assigned pharmacy");
    const [medicineId, batchNumber, quantity, expiry] = batchInput(input);
    if (expiry < new Date().toISOString().slice(0, 10)) throw badRequest("expiry_date cannot be in the past");
    const [m] = await pool.execute("SELECT medicine_id FROM medicines WHERE medicine_id = ? AND is_active = 1", [medicineId]);
    if (!m.length) throw notFound("Medicine not found");
    // A batch number that was removed earlier comes back to life (its dispensing history stays attached).
    const [gone] = await pool.execute("SELECT batch_id FROM medicine_batches WHERE pharmacy_id = ? AND batch_number = ? AND deleted_at IS NOT NULL", [pharmacyId, batchNumber]);
    if (gone.length) {
        await pool.execute("UPDATE medicine_batches SET medicine_id = ?, quantity = ?, expiry_date = ?, deleted_at = NULL WHERE batch_id = ?", [medicineId, quantity, expiry, gone[0].batch_id]);
        return gone[0].batch_id;
    }
    const [r] = await pool.execute("INSERT INTO medicine_batches (medicine_id, pharmacy_id, batch_number, quantity, expiry_date) VALUES (?, ?, ?, ?, ?)", [medicineId, pharmacyId, batchNumber, quantity, expiry]);
    return r.insertId;
}

async function ownedBatch(user, batchId, conn = pool) {
    const [r] = await conn.execute("SELECT batch_id, pharmacy_id, quantity FROM medicine_batches WHERE batch_id = ? AND deleted_at IS NULL", [toInt(batchId, "batchId")]);
    if (!r.length) throw notFound("Batch not found");
    if (r[0].pharmacy_id !== await staffPharmacy(user)) throw forbidden("You can only manage your assigned pharmacy");
    return r[0];
}

async function updateQuantity(user, id, input) {
    const change = toInt(input.quantity_change, "quantity_change", { min: -2147483647, max: 2147483647 });
    if (change === 0) throw badRequest("quantity_change cannot be zero");
    return withTransaction(async (conn) => {
        const batch = await ownedBatch(user, id, conn);
        const [locked] = await conn.execute("SELECT quantity FROM medicine_batches WHERE batch_id = ? FOR UPDATE", [batch.batch_id]);
        const quantity = locked[0].quantity + change;
        if (quantity < 0) throw badRequest("Quantity cannot become negative");
        await conn.execute("UPDATE medicine_batches SET quantity = ? WHERE batch_id = ?", [quantity, batch.batch_id]);
        return { batch_id: batch.batch_id, quantity };
    });
}

async function updateBatch(user, id, input) {
    const batch = await ownedBatch(user, id);
    const [medicineId, batchNumber, quantity, expiry] = batchInput(input);
    const [m] = await pool.execute("SELECT medicine_id FROM medicines WHERE medicine_id = ? AND is_active = 1", [medicineId]);
    if (!m.length) throw notFound("Medicine not found");
    await pool.execute("UPDATE medicine_batches SET medicine_id = ?, batch_number = ?, quantity = ?, expiry_date = ? WHERE batch_id = ?", [medicineId, batchNumber, quantity, expiry, batch.batch_id]);
    return { batch_id: batch.batch_id };
}

async function removeBatch(user, id) {
    const b = await ownedBatch(user, id);
    // Hidden, not erased: dispensing records still point at the batch, so a hard delete would fail or lose history.
    await pool.execute("UPDATE medicine_batches SET deleted_at = NOW() WHERE batch_id = ?", [b.batch_id]);
}

async function lowStock(user, id) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const [r] = await pool.execute(
        `SELECT m.medicine_id, m.name, m.strength, m.reorder_level,
                COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity ELSE 0 END), 0) AS total_on_hand
           FROM medicines m
           JOIN medicine_batches b ON b.medicine_id = m.medicine_id AND b.pharmacy_id = ? AND b.deleted_at IS NULL
          GROUP BY m.medicine_id, m.name, m.strength, m.reorder_level
         HAVING total_on_hand < m.reorder_level
          ORDER BY total_on_hand`,
        [pharmacyId]
    );
    return r;
}

async function expiring(user, id, query) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const days = query.days === undefined ? 60 : toInt(query.days, "days", { min: 1, max: 365 });
    const [r] = await pool.execute(
        `SELECT b.batch_id, b.medicine_id, m.name, b.batch_number, b.quantity, b.expiry_date,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left
           FROM medicine_batches b
           JOIN medicines m ON m.medicine_id = b.medicine_id
          WHERE b.pharmacy_id = ? AND b.deleted_at IS NULL AND b.quantity > 0 AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
          ORDER BY b.expiry_date`,
        [pharmacyId, days]
    );
    return { days, batches: r };
}

// ---------------- Pharmacy Dispensing Workflows ----------------

async function pendingPrescriptions(user, id, query = {}) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    let sql = `
        SELECT pr.prescription_id, pr.prescription_date, pr.diagnosis, pr.status,
               pu.name AS patient_name, p.patient_id, du.name AS doctor_name,
               (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = pr.prescription_id) AS item_count
          FROM prescriptions pr
          JOIN patients p ON p.patient_id = pr.patient_id
          JOIN users pu ON pu.user_id = p.user_id
          JOIN doctors d ON d.doctor_id = pr.doctor_id
          JOIN users du ON du.user_id = d.user_id
         WHERE pr.status = 'ACTIVE'
    `;
    const params = [];
    if (query.q && query.q.trim()) {
        const raw = query.q.trim();
        const rxNum = Number(raw);
        if (Number.isInteger(rxNum) && rxNum > 0) {
            sql += ` AND (pr.prescription_id = ? OR pu.name LIKE ?)`;
            params.push(rxNum, `%${raw.replace(/[%_\\]/g, "\\$&")}%`);
        } else {
            sql += ` AND pu.name LIKE ?`;
            params.push(`%${raw.replace(/[%_\\]/g, "\\$&")}%`);
        }
    }
    sql += ` ORDER BY pr.prescription_date DESC, pr.prescription_id DESC LIMIT 100`;
    const [rows] = await pool.execute(sql, params);
    return rows;
}

async function checkStock(user, id, prescriptionId) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const rxId = toInt(prescriptionId, "prescriptionId");
    const [headers] = await pool.execute(
        `SELECT pr.prescription_id, pr.doctor_id, pr.patient_id, pr.prescription_date, pr.diagnosis, pr.notes, pr.status,
                du.name AS doctor_name, pu.name AS patient_name
           FROM prescriptions pr
           JOIN doctors d ON d.doctor_id = pr.doctor_id JOIN users du ON du.user_id = d.user_id
           JOIN patients p ON p.patient_id = pr.patient_id JOIN users pu ON pu.user_id = p.user_id
          WHERE pr.prescription_id = ?`,
        [rxId]
    );
    if (!headers.length) throw notFound("Prescription not found");
    const header = headers[0];
    const [items] = await pool.execute(
        `SELECT pi.prescription_item_id, pi.medicine_id, m.name AS medicine_name, m.generic_name, m.strength,
                pi.dosage, pi.frequency, pi.frequency_per_day, pi.start_date, pi.end_date, pi.instructions
           FROM prescription_items pi
           JOIN medicines m ON m.medicine_id = pi.medicine_id
          WHERE pi.prescription_id = ? ORDER BY pi.prescription_item_id`,
        [rxId]
    );

    const checkedItems = [];
    let allSufficient = true;

    for (const item of items) {
        const days = courseDays(item.start_date, item.end_date);
        const requiredUnits = (item.frequency_per_day || 1) * Math.max(1, days);

        const [batches] = await pool.execute(
            `SELECT batch_id, batch_number, quantity, expiry_date,
                    DATEDIFF(expiry_date, CURDATE()) AS days_until_expiry
               FROM medicine_batches
              WHERE pharmacy_id = ? AND medicine_id = ? AND deleted_at IS NULL AND expiry_date >= CURDATE() AND quantity > 0
              ORDER BY expiry_date ASC, batch_id ASC`,
            [pharmacyId, item.medicine_id]
        );

        let available = 0;
        let remainingNeeded = requiredUnits;
        const suggestedBatches = [];

        for (const b of batches) {
            available += b.quantity;
            if (remainingNeeded > 0) {
                const take = Math.min(b.quantity, remainingNeeded);
                suggestedBatches.push({
                    batch_id: b.batch_id,
                    batch_number: b.batch_number,
                    expiry_date: b.expiry_date,
                    days_until_expiry: b.days_until_expiry,
                    quantity_available: b.quantity,
                    take
                });
                remainingNeeded -= take;
            }
        }

        const isSufficient = available >= requiredUnits;
        if (!isSufficient) allSufficient = false;

        checkedItems.push({
            ...item,
            course_days: days,
            required_quantity: requiredUnits,
            available_stock: available,
            is_sufficient: isSufficient,
            suggested_batches: suggestedBatches
        });
    }

    return {
        prescription: header,
        items: checkedItems,
        can_dispense: allSufficient && header.status === "ACTIVE"
    };
}

async function dispense(user, id, prescriptionId, input = {}, ctx = {}) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only dispense from your assigned pharmacy");
    const rxId = toInt(prescriptionId, "prescriptionId");

    return withTransaction(async (conn) => {
        const [headers] = await conn.execute(
            "SELECT prescription_id, status FROM prescriptions WHERE prescription_id = ? FOR UPDATE",
            [rxId]
        );
        if (!headers.length) throw notFound("Prescription not found");
        const header = headers[0];
        if (header.status === "CANCELLED") throw badRequest("Cannot dispense a cancelled prescription");
        if (header.status === "DISPENSED") throw badRequest("Prescription has already been dispensed");

        const [items] = await conn.execute(
            `SELECT pi.prescription_item_id, pi.medicine_id, m.name AS medicine_name,
                    pi.frequency_per_day, pi.start_date, pi.end_date
               FROM prescription_items pi
               JOIN medicines m ON m.medicine_id = pi.medicine_id
              WHERE pi.prescription_id = ? FOR UPDATE`,
            [rxId]
        );

        const dispensedRecords = [];

        for (const item of items) {
            const days = courseDays(item.start_date, item.end_date);
            const required = (item.frequency_per_day || 1) * Math.max(1, days);

            // Row-lock available batches for this medicine
            const [batches] = await conn.execute(
                `SELECT batch_id, batch_number, quantity, expiry_date
                   FROM medicine_batches
                  WHERE pharmacy_id = ? AND medicine_id = ? AND deleted_at IS NULL AND expiry_date >= CURDATE() AND quantity > 0
                  ORDER BY expiry_date ASC, batch_id ASC FOR UPDATE`,
                [pharmacyId, item.medicine_id]
            );

            const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
            if (totalAvailable < required) {
                throw badRequest(`Insufficient stock for ${item.medicine_name}. Required: ${required}, available in date: ${totalAvailable}`);
            }

            let needed = required;
            for (const b of batches) {
                if (needed <= 0) break;
                const deduct = Math.min(b.quantity, needed);
                await conn.execute(
                    "UPDATE medicine_batches SET quantity = quantity - ? WHERE batch_id = ?",
                    [deduct, b.batch_id]
                );
                const [ins] = await conn.execute(
                    `INSERT INTO dispensed_items (prescription_id, prescription_item_id, batch_id, quantity, dispensed_by, pharmacy_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [rxId, item.prescription_item_id, b.batch_id, deduct, user.id, pharmacyId]
                );
                dispensedRecords.push({
                    dispensed_item_id: ins.insertId,
                    medicine_id: item.medicine_id,
                    medicine_name: item.medicine_name,
                    batch_id: b.batch_id,
                    batch_number: b.batch_number,
                    quantity: deduct
                });
                needed -= deduct;
            }
        }

        await conn.execute(
            "UPDATE prescriptions SET status = 'DISPENSED', dispensed_at = NOW(), dispensed_by = ?, dispensed_pharmacy_id = ? WHERE prescription_id = ?",
            [user.id, pharmacyId, rxId]
        );

        await writeAudit({
            userId: user.id,
            action: "PRESCRIPTION_DISPENSE",
            entityType: "prescription",
            entityId: rxId,
            details: {
                pharmacy_id: pharmacyId,
                items_dispensed: items.length,
                total_batches_allocated: dispensedRecords.length
            },
            ip: ctx.ip
        }, conn);

        return {
            prescription_id: rxId,
            status: "DISPENSED",
            dispensed_at: new Date().toISOString(),
            dispensed_items: dispensedRecords
        };
    });
}

async function dispensations(user, id) {
    const pharmacyId = toInt(id, "pharmacyId");
    if (await staffPharmacy(user) !== pharmacyId) throw forbidden("You can only view your assigned pharmacy");
    const [rows] = await pool.execute(
        `SELECT pr.prescription_id, pr.prescription_date, pr.dispensed_at, pr.diagnosis,
                pu.name AS patient_name, du.name AS doctor_name, su.name AS dispensed_by_name,
                COUNT(DISTINCT di.dispensed_item_id) AS items_dispensed_count,
                COALESCE(SUM(di.quantity), 0) AS total_units_dispensed
           FROM prescriptions pr
           JOIN patients p ON p.patient_id = pr.patient_id
           JOIN users pu ON pu.user_id = p.user_id
           JOIN doctors d ON d.doctor_id = pr.doctor_id
           JOIN users du ON du.user_id = d.user_id
           JOIN users su ON su.user_id = pr.dispensed_by
           LEFT JOIN dispensed_items di ON di.prescription_id = pr.prescription_id
          WHERE pr.dispensed_pharmacy_id = ? AND pr.status = 'DISPENSED'
          GROUP BY pr.prescription_id, pr.prescription_date, pr.dispensed_at, pr.diagnosis, pu.name, du.name, su.name
          ORDER BY pr.dispensed_at DESC
          LIMIT 50`,
        [pharmacyId]
    );
    return rows;
}

module.exports = {
    checkStock,
    createBatch,
    dispense,
    dispensations,
    expiring,
    inventory,
    inventoryPage,
    lowStock,
    pendingPrescriptions,
    pharmacies,
    pharmacy,
    removeBatch,
    updateBatch,
    updateQuantity
};
