const { HttpError } = require("../utils/httpError");
const store = require("../utils/throttleStore");

// Counts every request (not only failures) per key and answers 429 once the limit is reached.
// Backed by the same table as the login throttle, so a restart does not reset it.
const HOUR = 60 * 60 * 1000;

function rateLimit({ scope, max, windowMs = HOUR, message = "Too many requests. Please try again later.", keyOf = (req) => req.ip }) {
    return async function limiter(req, res, next) {
        try {
            const key = String(keyOf(req));
            if (await store.isBlocked(scope, key, max)) return next(new HttpError(429, message));
            await store.recordFailure(scope, key, windowMs);
            next();
        } catch (err) { next(err); }
    };
}

const emailOf = (req) => String((req.body && req.body.email) || "").trim().toLowerCase().slice(0, 150);

// Limits, per IP (and per email for resend). Override in .env if needed.
const num = (name, fallback) => Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;

const registerLimit = rateLimit({ scope: "register", max: num("REGISTER_MAX_PER_HOUR", 20), message: "Too many sign-ups from this network. Please try again later." });
const verifyLimit = rateLimit({ scope: "verify-email", max: num("VERIFY_MAX_PER_HOUR", 30), message: "Too many attempts. Please try again later." });
const resendLimit = rateLimit({ scope: "resend-verification", max: num("RESEND_MAX_PER_HOUR", 5), keyOf: (req) => `${req.ip}|${emailOf(req)}`, message: "Too many requests. Please try again in an hour." });

const resetAllRateLimits = () => Promise.all(["register", "verify-email", "resend-verification"].map((s) => store.clearAll(s)));

module.exports = { rateLimit, registerLimit, verifyLimit, resendLimit, resetAllRateLimits };
