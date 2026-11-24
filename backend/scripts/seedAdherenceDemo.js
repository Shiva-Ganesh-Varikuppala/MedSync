// Adds made-up patients with a few weeks of dose history, so the adherence-risk screen and model have something to work on.
// The data is SYNTHETIC (see src/ml/synthetic.js). Demo accounts use the e-mail pattern demo.adherence.N@medsync.demo,
// cannot be signed into (random password nobody knows), and are removed again with --remove.
//
//   node --env-file=.env.local scripts/seedAdherenceDemo.js                         add 40 patients for Dr. Ananya Rao
//   node --env-file=.env.local scripts/seedAdherenceDemo.js --patients 60 --doctor rahul.mehta@medsync.dev --seed 7
//   node --env-file=.env.local scripts/seedAdherenceDemo.js --remove                delete every demo account and its data
//
// Needs migration 017 and at least one doctor and some medicines (the normal sample data has them).
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/config/database");
const { mulberry32, generatePatient } = require("../src/ml/synthetic");
const { parseTs } = require("../src/ml/adherenceFeatures");

const DOMAIN = "@medsync.demo";
const PREFIX = "demo.adherence.";
const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Vihaan", "Anika", "Arnav", "Saanvi", "Aditya", "Kiara", "Reyansh", "Myra", "Ishaan", "Navya"];
const LAST = ["Reddy", "Nair", "Gupta", "Iyer", "Khan", "Das", "Joshi", "Menon", "Bose", "Pillai", "Shah", "Rao"];
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// Demo data belongs in a local database. Writing it to a cloud database (e.g. Azure) needs an explicit --allow-remote.
function guard() {
    const host = process.env.DB_HOST || "";
    if (!/^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(host) && !process.argv.includes("--allow-remote")) {
        throw new Error(`DB_HOST is "${host}", which is not local. Use --env-file=.env.local, or add --allow-remote if you really mean it.`);
    }
    console.log(`Database: ${host}/${process.env.DB_NAME}`);
}

async function remove() {
    const [users] = await pool.query("SELECT user_id FROM users WHERE email LIKE ?", [`${PREFIX}%${DOMAIN}`]);
    if (!users.length) { console.log("No demo accounts found."); return; }
    const ids = users.map((u) => u.user_id);
    const [pts] = await pool.query("SELECT patient_id FROM patients WHERE user_id IN (?)", [ids]);
    const pids = pts.map((p) => p.patient_id);
    if (pids.length) {
        const [rx] = await pool.query("SELECT prescription_id FROM prescriptions WHERE patient_id IN (?)", [pids]);
        const rxIds = rx.map((r) => r.prescription_id);
        if (rxIds.length) {
            await pool.query("DELETE FROM refill_requests WHERE prescription_id IN (?)", [rxIds]);
            await pool.query("DELETE FROM reminders WHERE prescription_item_id IN (SELECT prescription_item_id FROM prescription_items WHERE prescription_id IN (?))", [rxIds]);
            await pool.query("DELETE FROM prescription_items WHERE prescription_id IN (?)", [rxIds]);
            await pool.query("DELETE FROM prescriptions WHERE prescription_id IN (?)", [rxIds]);
        }
        await pool.query("DELETE FROM patients WHERE patient_id IN (?)", [pids]);
    }
    await pool.query("DELETE FROM users WHERE user_id IN (?)", [ids]);
    console.log(`Removed ${ids.length} demo patient account(s) and their data.`);
}

async function add() {
    const count = Math.min(200, Math.max(1, Number(arg("patients", 40))));
    const seed = Number(arg("seed", 2026));
    const doctorEmail = arg("doctor", "ananya.rao@medsync.dev");
    const [[doctor]] = await pool.query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = ?", [doctorEmail]);
    if (!doctor) throw new Error(`No doctor with e-mail ${doctorEmail}.`);
    const [meds] = await pool.query("SELECT medicine_id FROM medicines WHERE is_active = 1 ORDER BY medicine_id LIMIT 20");
    if (!meds.length) throw new Error("There are no medicines in the catalog.");
    const [[{ n: existing }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE ?", [`${PREFIX}%${DOMAIN}`]);
    if (existing) throw new Error(`${existing} demo account(s) already exist. Run with --remove first.`);

    const [[now]] = await pool.query("SELECT NOW() AS n");
    const endMs = parseTs(now.n);
    const rng = mulberry32(seed);
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);   // nobody knows it: demo accounts cannot sign in
    let doses = 0;

    for (let i = 1; i <= count; i++) {
        const p = generatePatient(rng, { days: 75, endMs });
        const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
        const [u] = await pool.query(
            "INSERT INTO users (name, email, password_hash, role, phone, is_active, email_verified_at) VALUES (?, ?, ?, 'PATIENT', NULL, 1, NOW())",
            [`${name} (demo)`, `${PREFIX}${i}${DOMAIN}`, hash]);
        const dob = `${new Date(endMs).getUTCFullYear() - p.ageYears}-06-15`;
        const [pt] = await pool.query("INSERT INTO patients (user_id, date_of_birth, gender) VALUES (?, ?, ?)", [u.insertId, dob, rng() < 0.5 ? "Female" : "Male"]);
        const start = endMs - 76 * 864e5, end = endMs + 14 * 864e5;
        const [rx] = await pool.query(
            "INSERT INTO prescriptions (doctor_id, patient_id, prescription_date, diagnosis, notes, status) VALUES (?, ?, ?, 'Demo: long-term medication', 'Synthetic demo data', 'ACTIVE')",
            [doctor.doctor_id, pt.insertId, day(start)]);
        const itemIds = [];
        for (let k = 0; k < p.freqs.length; k++) {
            const med = meds[Math.floor(rng() * meds.length)].medicine_id;
            const [it] = await pool.query(
                "INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, start_date, end_date, instructions, frequency_per_day) VALUES (?, ?, '1 tablet', ?, ?, ?, NULL, ?)",
                [rx.insertId, med, `${p.freqs[k]} time(s) daily`, day(start), day(end), p.freqs[k]]);
            itemIds.push(it.insertId);
        }
        const rows = p.doses.map((d) => [itemIds[d.item], stamp(d.t), d.status, stamp(d.answered)]);
        for (let o = 0; o < rows.length; o += 500) {
            await pool.query("INSERT INTO reminders (prescription_item_id, scheduled_at, status, status_updated_at) VALUES ?", [rows.slice(o, o + 500)]);
        }
        doses += rows.length;
    }
    console.log(`Added ${count} synthetic patients with ${doses} answered doses for ${doctorEmail}.`);
    console.log("Next: npm run ml:train   (or press \"Retrain model\" in the admin Analytics tab)");
}

Promise.resolve().then(guard).then(() => (process.argv.includes("--remove") ? remove() : add()))
    .catch((e) => { console.error(`Failed: ${e.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
