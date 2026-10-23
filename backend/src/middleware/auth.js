const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { jwtSecret, cookieName } = require("../config/env");
const { unauthorized, forbidden } = require("../utils/httpError");

function readToken(req) {
    if (req.cookies && req.cookies[cookieName]) return req.cookies[cookieName];
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) return header.slice(7);
    return null;
}

// Loads the caller fresh from the database on every request, so a deactivated
// user or a changed role takes effect immediately.
async function authenticate(req, res, next) {
    try {
        const token = readToken(req);
        if (!token) throw unauthorized();

        let payload;
        try {
            payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
        } catch (_) {
            throw unauthorized();
        }

        const [rows] = await pool.query(
            `SELECT u.user_id, u.name, u.email, u.role, u.is_active, UNIX_TIMESTAMP(u.password_changed_at) AS pwd_changed,
                    d.doctor_id, p.patient_id, ps.pharmacy_id
               FROM users u
               LEFT JOIN doctors d ON d.user_id = u.user_id
               LEFT JOIN patients p ON p.user_id = u.user_id
               LEFT JOIN pharmacy_staff ps ON ps.user_id = u.user_id
              WHERE u.user_id = ?`,
            [payload.sub]
        );
        const u = rows[0];
        if (!u || !u.is_active) throw unauthorized();
        // A password change signs out every older token.
        if (u.pwd_changed && payload.iat < Number(u.pwd_changed)) throw unauthorized();

        req.user = {
            id: u.user_id,
            name: u.name,
            email: u.email,
            role: u.role,
            doctorId: u.doctor_id,
            patientId: u.patient_id,
            pharmacyId: u.pharmacy_id
        };
        next();
    } catch (err) {
        next(err);
    }
}

// Step 1 of the two-step authorization: is this role allowed on this route?
// (Step 2, ownership, is checked inside the services.)
const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(forbidden());

module.exports = { authenticate, requireRole };
