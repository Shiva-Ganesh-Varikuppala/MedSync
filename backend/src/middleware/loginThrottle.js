const { HttpError } = require("../utils/httpError");
const store = require("../utils/throttleStore");

const SCOPE = "login";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const keyOf = (req) => `${req.ip}|${String(req.body && req.body.email || "").toLowerCase()}`;

async function checkThrottle(req, res, next) {
    try {
        if (await store.isBlocked(SCOPE, keyOf(req), MAX_FAILURES)) return next(new HttpError(429, "Too many failed attempts. Try again in 15 minutes."));
        next();
    } catch (err) { next(err); }
}

const recordFailure = (req) => store.recordFailure(SCOPE, keyOf(req), WINDOW_MS);
const clearFailures = (req) => store.clear(SCOPE, keyOf(req));
const resetAllThrottles = () => store.clearAll(SCOPE); // used by tests (returns a promise)

module.exports = { checkThrottle, recordFailure, clearFailures, resetAllThrottles };
