const pool = require("../config/database");

// Failed-attempt counters kept in the database, so a restart (or a second server) does not reset a lockout.
// If the table is missing or the database errors, counting falls back to this process's memory
// so sign-in itself never breaks because of the throttle.
const memory = new Map(); // `${scope}|${key}` -> { count, resetAt }
let warned = false;
const warn = (err) => { if (!warned) { warned = true; console.warn(`[throttle] using in-memory counters (${err.message}). Run migration 008_login_throttle.sql.`); } };
const k = (scope, key) => `${scope}|${key}`;

async function isBlocked(scope, key, max) {
    try {
        const [rows] = await pool.execute("SELECT 1 FROM throttle_attempts WHERE scope = ? AND throttle_key = ? AND reset_at > NOW() AND attempts >= ?", [scope, key.slice(0, 190), max]);
        return rows.length > 0;
    } catch (err) {
        warn(err);
        const e = memory.get(k(scope, key));
        return Boolean(e && e.resetAt > Date.now() && e.count >= max);
    }
}

async function recordFailure(scope, key, windowMs) {
    try {
        await pool.execute(
            `INSERT INTO throttle_attempts (scope, throttle_key, attempts, reset_at)
             VALUES (?, ?, 1, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE
               attempts = IF(reset_at <= NOW(), 1, attempts + 1),
               reset_at = IF(reset_at <= NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), reset_at)`,
            [scope, key.slice(0, 190), Math.round(windowMs / 1000), Math.round(windowMs / 1000)]
        );
    } catch (err) {
        warn(err);
        const now = Date.now(); const e = memory.get(k(scope, key));
        if (!e || e.resetAt <= now) memory.set(k(scope, key), { count: 1, resetAt: now + windowMs }); else e.count += 1;
    }
}

async function clear(scope, key) {
    memory.delete(k(scope, key));
    try { await pool.execute("DELETE FROM throttle_attempts WHERE scope = ? AND throttle_key = ?", [scope, key.slice(0, 190)]); } catch (err) { warn(err); }
}

async function clearAll(scope) {
    for (const x of [...memory.keys()]) if (x.startsWith(`${scope}|`)) memory.delete(x);
    try { await pool.execute("DELETE FROM throttle_attempts WHERE scope = ?", [scope]); } catch (err) { warn(err); }
}

module.exports = { isBlocked, recordFailure, clear, clearAll };
