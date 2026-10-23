const { writeAudit } = require("./audit");

async function auditSafe(event) {
    try { await writeAudit(event); } catch (error) { console.error("Audit write failed:", error.message); }
}

module.exports = { auditSafe };
