// Sets a real password for one account. Works in production, unlike dev:passwords.
//   NEW_PASSWORD='Str0ng@Pass1' node scripts/setUserPassword.js admin@medsync.dev
// (Passing the password through the environment keeps it out of your shell history's command arguments and the process list.)
const bcrypt = require("bcryptjs");
const pool = require("../src/config/database");
const { checkPassword } = require("../src/services/authService");

(async () => {
    const email = (process.argv[2] || "").trim().toLowerCase();
    const password = process.env.NEW_PASSWORD;
    if (!email || !password) throw new Error("Usage: NEW_PASSWORD='...' node scripts/setUserPassword.js user@example.com");
    const valid = checkPassword(password);
    const hash = await bcrypt.hash(valid, 12);
    const [[user]] = await pool.query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (!user) throw new Error(`No user with the email ${email}`);
    await pool.query("UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE user_id = ?", [hash, user.user_id]);
    await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [user.user_id]);
    console.log(`Password updated for ${email}. Any older sign-ins for that account no longer work.`);
    await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
