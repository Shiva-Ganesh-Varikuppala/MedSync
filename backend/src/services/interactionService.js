const pool = require("../config/database");
const { badRequest } = require("../utils/httpError");
const { toInt } = require("../utils/validate");

async function check(values, patientId = null) {
    if (!values) throw badRequest("medicineIds is required");
    const newIds = [...new Set(String(values).split(",").map(v => toInt(v.trim(), "medicineIds")))];

    let activeMeds = [];
    const activeMap = new Map();

    if (patientId) {
        const pId = toInt(patientId, "patientId");
        const [rows] = await pool.execute(
            `SELECT DISTINCT pi.medicine_id, m.name AS medicine_name, pi.dosage, pi.start_date, pi.end_date,
                    du.name AS doctor_name, pr.prescription_id
               FROM prescription_items pi
               JOIN prescriptions pr ON pr.prescription_id = pi.prescription_id
               JOIN medicines m ON m.medicine_id = pi.medicine_id
               JOIN doctors d ON d.doctor_id = pr.doctor_id
               JOIN users du ON du.user_id = d.user_id
              WHERE pr.patient_id = ?
                AND pr.status IN ('ACTIVE', 'DISPENSED')
                AND pi.end_date >= CURDATE()`,
            [pId]
        );
        activeMeds = rows;
        for (const r of rows) {
            activeMap.set(r.medicine_id, r);
        }
    }

    const allIds = [...new Set([...newIds, ...activeMeds.map(m => m.medicine_id)])];

    if (allIds.length < 2) {
        if (!patientId && newIds.length < 2) {
            throw badRequest("medicineIds must contain at least two distinct medicine IDs");
        }
        return [];
    }

    const marks = allIds.map(() => "?").join(",");
    const [rows] = await pool.execute(
        `SELECT i.interaction_id, i.medicine_id_1, m1.name AS medicine_1, i.medicine_id_2, m2.name AS medicine_2, i.severity, i.description
           FROM medicine_interactions i
           JOIN medicines m1 ON m1.medicine_id = i.medicine_id_1
           JOIN medicines m2 ON m2.medicine_id = i.medicine_id_2
          WHERE i.medicine_id_1 IN (${marks}) AND i.medicine_id_2 IN (${marks}) AND i.medicine_id_1 <> i.medicine_id_2
          ORDER BY i.severity DESC, i.interaction_id`,
        [...allIds, ...allIds]
    );

    const newIdSet = new Set(newIds);
    const seen = new Set();
    const result = [];

    for (const r of rows) {
        const key = [r.medicine_id_1, r.medicine_id_2].sort((a, b) => a - b).join(":");
        if (seen.has(key)) continue;
        seen.add(key);

        const inNew1 = newIdSet.has(r.medicine_id_1);
        const inNew2 = newIdSet.has(r.medicine_id_2);

        // Only include interactions where at least one drug is in the newly requested list
        if (!inNew1 && !inNew2) continue;

        const isInternal = inNew1 && inNew2;
        const crossMedId = !inNew1 ? r.medicine_id_1 : !inNew2 ? r.medicine_id_2 : null;
        const activeDetails = crossMedId ? activeMap.get(crossMedId) : null;

        result.push({
            ...r,
            is_cross_prescription: !isInternal,
            existing_medication: activeDetails ? {
                medicine_id: activeDetails.medicine_id,
                medicine_name: activeDetails.medicine_name,
                dosage: activeDetails.dosage,
                doctor_name: activeDetails.doctor_name,
                prescription_id: activeDetails.prescription_id,
                end_date: activeDetails.end_date
            } : null
        });
    }

    return result;
}

async function forMedicine(id) {
    return check(`${toInt(id, "medicineId")},${toInt(id, "medicineId")}`);
}

module.exports = { check, forMedicine };
