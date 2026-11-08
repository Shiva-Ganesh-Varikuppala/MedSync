const { HttpError } = require("../utils/httpError");
const store = require("../utils/throttleStore");

// Limits wrong "current password" guesses on the change-password endpoint,
// so a stolen session cannot be used to guess the account password.
const SCOPE = "password";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

async function checkPasswordThrottle(req, res, next) {
    try {
        if (await store.isBlocked(SCOPE, String(req.user.id), MAX_FAILURES)) return next(new HttpError(429, "Too many incorrect attempts. Try again in 15 minutes."));
        next();
    } catch (err) { next(err); }
}

const recordPasswordFailure = (userId) => store.recordFailure(SCOPE, String(userId), WINDOW_MS);
const clearPasswordFailures = (userId) => store.clear(SCOPE, String(userId));
const resetAllPasswordThrottles = () => store.clearAll(SCOPE); // used by tests

module.exports = { checkPasswordThrottle, recordPasswordFailure, clearPasswordFailures, resetAllPasswordThrottles };
