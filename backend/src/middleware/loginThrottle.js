const { HttpError } = require("../utils/httpError");

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map(); // key -> { count, resetAt }

const keyOf = (req) => `${req.ip}|${String(req.body && req.body.email || "").toLowerCase()}`;

function checkThrottle(req, res, next) {
    const entry = failures.get(keyOf(req));
    if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILURES) {
        return next(new HttpError(429, "Too many failed attempts. Try again in 15 minutes."));
    }
    next();
}

function recordFailure(req) {
    const key = keyOf(req);
    const now = Date.now();
    const entry = failures.get(key);
    if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else entry.count += 1;
}

const clearFailures = (req) => failures.delete(keyOf(req));
const resetAllThrottles = () => failures.clear(); // used by tests

module.exports = { checkThrottle, recordFailure, clearFailures, resetAllThrottles };
