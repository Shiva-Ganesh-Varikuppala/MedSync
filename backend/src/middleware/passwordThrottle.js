const { HttpError } = require("../utils/httpError");

// Limits wrong "current password" guesses on the change-password endpoint,
// so a stolen session cannot be used to guess the account password.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map(); // userId -> { count, resetAt }

function checkPasswordThrottle(req, res, next) {
    const entry = failures.get(req.user.id);
    if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILURES) {
        return next(new HttpError(429, "Too many incorrect attempts. Try again in 15 minutes."));
    }
    next();
}

function recordPasswordFailure(userId) {
    const now = Date.now();
    const entry = failures.get(userId);
    if (!entry || entry.resetAt <= now) failures.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    else entry.count += 1;
}

const clearPasswordFailures = (userId) => failures.delete(userId);
const resetAllPasswordThrottles = () => failures.clear(); // used by tests

module.exports = { checkPasswordThrottle, recordPasswordFailure, clearPasswordFailures, resetAllPasswordThrottles };
