const pool = require("../config/database");

// Runs fn(connection) inside one transaction: all statements commit together
// or none do (NFR-05).
async function withTransaction(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        try { await conn.rollback(); } catch (_) { /* connection already lost */ }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { withTransaction };
