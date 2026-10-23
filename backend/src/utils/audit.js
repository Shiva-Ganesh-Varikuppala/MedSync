const pool = require("../config/database");

// Pass a transaction connection as `db` to make the audit row part of that
// transaction; omit it to write on its own.
async function writeAudit({ userId = null, action, entityType, entityId = null, details = null, ip = null }, db = pool) {
    await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip]
    );
}

module.exports = { writeAudit };
