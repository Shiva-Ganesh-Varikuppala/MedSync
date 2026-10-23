// Gives every user in the database the same known password, for development only.
// The seed files contain placeholder password hashes that no real password matches.
//   node scripts/setDevPasswords.js            -> password "Test@12345"
//   DEV_PASSWORD=Other@123 node scripts/setDevPasswords.js
const bcrypt = require("bcryptjs");
const pool = require("../src/config/database");

(async () => {
    if (process.env.NODE_ENV === "production") {
        console.error("Refusing to run in production.");
        process.exit(1);
    }
    const password = process.env.DEV_PASSWORD || "Test@12345";
    const hash = await bcrypt.hash(password, 12);
    const [res] = await pool.query("UPDATE users SET password_hash = ? WHERE user_id > 0", [hash]);
    console.log(`Set the password of ${res.affectedRows} users to "${password}"`);
    await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
