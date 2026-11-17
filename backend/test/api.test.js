// Integration tests against a REAL throw-away MySQL database built from
// database/schema + seeds + migrations (see scripts/setupTestDb.js).
//   npm run test          (needs DB_* in .env; uses database "<DB_NAME>_test")
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { setupTestDb } = require("../scripts/setupTestDb");

const PASSWORD = "Test@12345";
let server, base, pool, throttle;
let sender, realSendVerification;
const outbox = []; // verification emails "sent" during the tests (nothing real is ever sent)
const tokens = {};

async function call(method, url, { body, as } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (as && tokens[as]) headers.Authorization = `Bearer ${tokens[as]}`;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) { /* e.g. 204 */ }
    return { status: res.status, json };
}
async function login(name, email) {
    const r = await call("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
    assert.equal(r.status, 200, `login ${email}`);
    tokens[name] = r.json.data.token;
}
const p2 = (n) => String(n).padStart(2, "0");
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

before(async () => {
    // Tests must never use real mail or SMS accounts, even when backend/.env has them (e.g. the Gmail App Password).
    for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_NAME", "SMTP_FROM_EMAIL", "MAIL_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_API_BASE"]) process.env[k] = ""; // empty, not deleted: the app's own dotenv call would otherwise load them again from .env
    process.env.DB_NAME = await setupTestDb(); // before the app loads the pool
    pool = require("../src/config/database");
    await pool.query("UPDATE users SET password_hash = ? WHERE user_id > 0", [await require("bcryptjs").hash(PASSWORD, 4)]);
    throttle = require("../src/middleware/loginThrottle");
    sender = require("../src/services/messageSender");
    realSendVerification = sender.sendVerificationEmail;
    sender.sendVerificationEmail = async (to, token, name) => { outbox.push({ to, token, name }); };
    server = require("../src/app").listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${server.address().port}`;
    await login("doc", "ananya.rao@medsync.dev");
    await login("doc2", "rahul.mehta@medsync.dev");
    await login("pat1", "arjun.kumar@medsync.dev");
    await login("pat2", "priya.sharma@medsync.dev");
    await login("staff1", "neha.patel@medsync.dev");
    await login("staff2", "amit.verma@medsync.dev");
});
after(async () => { server.close(); await pool.end(); });

test("protected routes reject anonymous callers; health is public", async () => {
    assert.equal((await call("GET", "/api/health")).status, 200);
    for (const p of ["/api/medicines", "/api/reminders", "/api/patients/me/prescriptions", "/api/pharmacies"]) {
        assert.equal((await call("GET", p)).status, 401, p);
    }
});

test("public registration can only create patients (no self-made doctors)", async () => {
    const base_ = { name: "Test Person", email: "new@medsync.dev", password: "Strong@123", date_of_birth: "2000-01-15" };
    assert.equal((await call("POST", "/api/auth/register", { body: { ...base_, email: "d@x.com", role: "DOCTOR", license_number: "L1", specialization: "x" } })).status, 403);
    assert.equal((await call("POST", "/api/auth/register", { body: { ...base_, email: "s@x.com", role: "PHARMACY_STAFF", pharmacy_id: 1 } })).status, 403);
    assert.equal((await call("POST", "/api/auth/register", { body: base_ })).status, 201);
    const [[u]] = await pool.query("SELECT role FROM users WHERE email = 'new@medsync.dev'");
    assert.equal(u.role, "PATIENT");
    assert.equal((await call("POST", "/api/auth/register", { body: { ...base_, email: "w@x.com", password: "short" } })).status, 400);
});

test("login: same answer for wrong password and unknown email; failures and successes are audited; throttled after 5", async () => {
    await throttle.resetAllThrottles();
    const a = await call("POST", "/api/auth/login", { body: { email: "ananya.rao@medsync.dev", password: "Wrong@1234" } });
    const b = await call("POST", "/api/auth/login", { body: { email: "ghost@medsync.dev", password: "Wrong@1234" } });
    assert.equal(a.status, 401);
    assert.deepEqual(a.json, b.json);
    const [f] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'LOGIN_FAILED'");
    assert.ok(f.length >= 2);
    const [s] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'LOGIN'");
    assert.ok(s.length >= 1);
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "' OR 1=1 --", password: "x" } })).status, 400); // not even a valid email
    for (let i = 0; i < 4; i++) await call("POST", "/api/auth/login", { body: { email: "victim@medsync.dev", password: "bad" } });
    await call("POST", "/api/auth/login", { body: { email: "victim@medsync.dev", password: "bad" } });
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "victim@medsync.dev", password: "bad" } })).status, 429);
    await throttle.resetAllThrottles();
});

test("medicine list is paged (works on MySQL 8) and search treats % as plain text", async () => {
    const r = await call("GET", "/api/medicines?limit=3&page=2", { as: "pat1" });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.items.length, 3);
    assert.equal((await call("GET", "/api/medicines/search?q=para", { as: "doc" })).json.data[0].name, "Paracetamol");
    assert.equal((await call("GET", "/api/medicines/search?q=%25", { as: "doc" })).json.data.length, 0);
});

test("interaction check finds a pair in either order and detects cross-prescription interactions", async () => {
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=1,3", { as: "doc" })).json.data.length, 1);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3,1", { as: "doc" })).json.data.length, 1);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=5,6", { as: "doc" })).json.data.length, 0);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=1", { as: "doc" })).status, 400);

    // Cross-prescription check: patient 1 has an active course of medicine 1 (Paracetamol).
    // Testing only medicine 3 (Ibuprofen) with patientId=1 should detect the cross-prescription clash!
    // The seed course ended in the past, so give it a future end date first (keeps the test valid on any day).
    await pool.query("UPDATE prescription_items SET end_date = ? WHERE prescription_id = 1 AND medicine_id = 1", [inDays(5)]);
    const cross = await call("GET", "/api/interactions/check?medicineIds=3&patientId=1", { as: "doc" });
    assert.equal(cross.status, 200);
    assert.ok(cross.json.data.length >= 1);
    assert.equal(cross.json.data[0].is_cross_prescription, true);
    assert.ok(cross.json.data[0].existing_medication);
});

let rxId;
const rxBody = (patient = 1) => ({
    patient_id: patient, prescription_date: inDays(0), diagnosis: "Test",
    items: [
        { medicine_id: 1, dosage: "500 mg", frequency: "Twice daily", frequency_per_day: 2, start_date: inDays(0), end_date: inDays(2) },
        { medicine_id: 3, dosage: "400 mg", frequency: "Once daily", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(1) }
    ]
});

test("a new prescription saves items, reminders and an audit row together and warns about interactions", async () => {
    const r = await call("POST", "/api/prescriptions", { as: "doc", body: rxBody() });
    assert.equal(r.status, 201);
    rxId = r.json.data.prescription_id;
    assert.equal(r.json.data.interaction_warnings.length, 1); // paracetamol + ibuprofen
    const [[c]] = await pool.query(`SELECT COUNT(*) n FROM reminders r JOIN prescription_items i ON i.prescription_item_id = r.prescription_item_id WHERE i.prescription_id = ?`, [rxId]);
    assert.equal(c.n, 2 * 3 + 1 * 2); // twice daily x 3 days + once daily x 2 days
    const [a] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'PRESCRIPTION_CREATE' AND entity_id = ?", [rxId]);
    assert.equal(a.length, 1);
});

test("invalid prescriptions are refused and leave nothing behind", async () => {
    const count = async () => (await pool.query("SELECT (SELECT COUNT(*) FROM prescriptions) p, (SELECT COUNT(*) FROM prescription_items) i, (SELECT COUNT(*) FROM reminders) r"))[0][0];
    const before = await count();
    const item = rxBody().items[0];
    const bad = [
        { ...rxBody(), items: [] },
        { ...rxBody(), items: [{ ...item, frequency_per_day: 7 }] },
        { ...rxBody(), items: [{ ...item, end_date: inDays(-5) }] },
        { ...rxBody(), items: [{ ...item, medicine_id: 999 }] },
        { ...rxBody(), patient_id: 999 },
        { ...rxBody(), items: [item, { ...rxBody().items[1], medicine_id: 999 }] } // second item fails after the first is valid
    ];
    for (const b of bad) assert.ok([400, 404].includes((await call("POST", "/api/prescriptions", { as: "doc", body: b })).status));
    assert.deepEqual(await count(), before);
});

test("ownership: 404 for strangers (no id probing), pharmacy staff may view", async () => {
    assert.equal((await call("GET", `/api/prescriptions/${rxId}`, { as: "doc" })).status, 200);
    assert.equal((await call("GET", `/api/prescriptions/${rxId}`, { as: "pat1" })).status, 200);
    assert.equal((await call("GET", `/api/prescriptions/${rxId}`, { as: "staff1" })).status, 200);
    assert.equal((await call("GET", `/api/prescriptions/${rxId}`, { as: "pat2" })).status, 404);
    assert.equal((await call("GET", `/api/prescriptions/${rxId}`, { as: "doc2" })).status, 404);
    assert.equal((await call("POST", "/api/prescriptions", { as: "pat1", body: rxBody() })).status, 403);
    assert.equal((await call("GET", `/api/prescriptions/${rxId}/items`, { as: "pat1" })).json.data.length, 2);
});

test("active list includes a course that starts tomorrow; other patients see nothing of it", async () => {
    const mk = await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 1, prescription_date: inDays(0), items: [{ medicine_id: 5, dosage: "10 mg", frequency: "Once daily", frequency_per_day: 1, start_date: inDays(1), end_date: inDays(3) }] } });
    const active = (await call("GET", "/api/patients/me/prescriptions/active", { as: "pat1" })).json.data.map((p) => p.prescription_id);
    assert.ok(active.includes(mk.json.data.prescription_id));
    assert.ok(active.includes(rxId));
    assert.equal((await call("GET", "/api/patients/me/prescriptions/active", { as: "pat2" })).json.data.length, 0);
});

test("doctor patient search needs 2+ characters and hides contact data; history views are audited", async () => {
    assert.equal((await call("GET", "/api/doctors/patients", { as: "doc" })).status, 400);
    assert.equal((await call("GET", "/api/doctors/patients?q=a", { as: "doc" })).status, 400);
    const r = await call("GET", "/api/doctors/patients?q=Arj", { as: "doc" });
    assert.equal(r.json.data[0].name, "Arjun Kumar");
    assert.equal("email" in r.json.data[0] || "phone" in r.json.data[0], false);
    assert.equal((await call("GET", "/api/doctors/patients/1/prescriptions", { as: "doc" })).status, 200);
    const [a] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'PATIENT_HISTORY_VIEW' AND entity_id = 1");
    assert.equal(a.length, 1);
    assert.equal((await call("GET", "/api/doctors/patients?q=Arj", { as: "pat1" })).status, 403);
});

test("reminders: generated slots, status update, ownership", async () => {
    const list = (await call("GET", "/api/reminders", { as: "pat1" })).json.data;
    const mine = list.filter((r) => r.prescription_item_id && r.scheduled_at.startsWith(inDays(0)) && r.medicine_name === "Paracetamol");
    assert.deepEqual(mine.filter((m) => m.status === "PENDING").slice(-2).map((m) => m.scheduled_at.slice(11, 16)), ["08:00", "20:00"]);
    const id = mine[0].reminder_id;
    assert.equal((await call("PATCH", `/api/reminders/${id}/status`, { as: "pat2", body: { status: "TAKEN" } })).status, 404);
    assert.equal((await call("PATCH", `/api/reminders/${id}/status`, { as: "pat1", body: { status: "DONE" } })).status, 400);
    assert.equal((await call("PATCH", `/api/reminders/${id}/status`, { as: "pat1", body: { status: "TAKEN" } })).json.data.status, "TAKEN");
});

test("pharmacy: inventory is limited to your own pharmacy; low-stock and expiry reports work", async () => {
    assert.equal((await call("GET", "/api/pharmacies/1/inventory", { as: "staff1" })).status, 200);
    assert.equal((await call("GET", "/api/pharmacies/1/inventory", { as: "staff2" })).status, 403);
    assert.equal((await call("GET", "/api/pharmacies/1/inventory", { as: "pat1" })).status, 403);

    const add = await call("POST", "/api/pharmacies/1/batches", { as: "staff1", body: { medicine_id: 9, batch_number: "T-1", quantity: 10, expiry_date: inDays(10) } });
    assert.equal(add.status, 201);
    const batch = add.json.data.batch_id;
    assert.equal((await call("POST", "/api/pharmacies/1/batches", { as: "staff1", body: { medicine_id: 9, batch_number: "T-1", quantity: 10, expiry_date: inDays(10) } })).status, 409);

    const exp = (await call("GET", "/api/pharmacies/1/expiring?days=60", { as: "staff1" })).json.data.batches;
    assert.equal(exp.find((b) => b.batch_id === batch).days_left, 10);
    assert.equal((await call("GET", "/api/pharmacies/1/expiring?days=0", { as: "staff1" })).status, 400);

    // 10 units is below atorvastatin's reorder level (20)
    assert.ok((await call("GET", "/api/pharmacies/1/low-stock", { as: "staff1" })).json.data.some((m) => m.name === "Atorvastatin"));
    assert.equal((await call("PATCH", `/api/batches/${batch}/quantity`, { as: "staff2", body: { quantity_change: 5 } })).status, 403);
    assert.equal((await call("PATCH", `/api/batches/${batch}/quantity`, { as: "staff1", body: { quantity_change: -50 } })).status, 400);
    assert.equal((await call("PATCH", `/api/batches/${batch}/quantity`, { as: "staff1", body: { quantity_change: 40 } })).json.data.quantity, 50);
    assert.ok(!(await call("GET", "/api/pharmacies/1/low-stock", { as: "staff1" })).json.data.some((m) => m.name === "Atorvastatin"));
});

test("every successful write is audited with a readable action and entity id", async () => {
    const [rows] = await pool.query("SELECT action, entity_id FROM audit_logs WHERE action LIKE 'PATCH_%' OR action LIKE 'POST_%'");
    await new Promise((r) => setTimeout(r, 200)); // the audit write happens right after the response
    const [again] = await pool.query("SELECT action, entity_id FROM audit_logs WHERE action IN ('PATCH_BATCHES', 'PATCH_REMINDERS', 'POST_PHARMACIES')");
    assert.ok(again.length >= 3, JSON.stringify(rows));
    assert.ok(again.some((r) => r.action === "PATCH_BATCHES" && r.entity_id));
});

// ---------------- phase 1 additions ----------------
test("frequency text is derived from the number of doses (no mismatch); label alone is accepted", async () => {
    const item = { medicine_id: 6, dosage: "20 mg", start_date: inDays(0), end_date: inDays(1) };
    const a = await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 2, prescription_date: inDays(0), items: [{ ...item, frequency: "whatever", frequency_per_day: 3 }] } });
    assert.equal(a.status, 201);
    assert.equal(a.json.data.items[0].frequency, "Three times daily");
    const b = await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 2, prescription_date: inDays(0), items: [{ ...item, frequency: "Twice daily" }] } });
    assert.equal(b.json.data.items[0].frequency_per_day, 2);
    assert.equal((await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 2, prescription_date: inDays(0), items: [{ ...item, frequency: "now and then" }] } })).status, 400);
    assert.equal((await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 2, prescription_date: inDays(0), items: [{ ...item, frequency_per_day: 1, end_date: inDays(400) }] } })).status, 400);
});

test("cancel: only the author, once; cancelled prescriptions move to past and their reminders disappear", async () => {
    const mk = await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: 2, prescription_date: inDays(0), items: [{ medicine_id: 5, dosage: "10 mg", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(3) }] } });
    const id = mk.json.data.prescription_id;
    const ids = async (s) => (await call("GET", `/api/patients/me/prescriptions?status=${s}`, { as: "pat2" })).json.data.map((p) => p.prescription_id);
    assert.ok((await ids("active")).includes(id));
    assert.ok(!(await ids("past")).includes(id));
    assert.equal((await call("POST", `/api/prescriptions/${id}/cancel`, { as: "doc2" })).status, 404);
    assert.equal((await call("POST", `/api/prescriptions/${id}/cancel`, { as: "pat2" })).status, 403);
    assert.equal((await call("POST", `/api/prescriptions/${id}/cancel`, { as: "doc" })).status, 200);
    assert.equal((await call("POST", `/api/prescriptions/${id}/cancel`, { as: "doc" })).status, 400);
    assert.ok(!(await ids("active")).includes(id));
    assert.ok((await ids("past")).includes(id));
    const rem = (await call("GET", "/api/reminders", { as: "pat2" })).json.data;
    assert.equal(rem.filter((r) => r.prescription_item_id && r.medicine_name === "Cetirizine" && r.scheduled_at.startsWith(inDays(1))).length, 0);
    const [a] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'PRESCRIPTION_CANCEL' AND entity_id = ?", [id]);
    assert.equal(a.length, 1);
});

test("doctor sees only their own prescriptions with patient names", async () => {
    const mine = (await call("GET", "/api/doctors/me/prescriptions", { as: "doc" })).json.data;
    assert.ok(mine.length >= 3 && mine.every((p) => p.patient_name));
    assert.equal((await call("GET", "/api/doctors/me/prescriptions", { as: "doc2" })).json.data.length, 0);
    assert.equal((await call("GET", "/api/doctors/me/prescriptions", { as: "pat1" })).status, 403);
});

test("due reminders: only unanswered doses whose time has passed", async () => {
    const [[seed]] = await pool.query("SELECT reminder_id FROM reminders WHERE status = 'PENDING' AND scheduled_at <= NOW() AND prescription_item_id IN (SELECT prescription_item_id FROM prescription_items i JOIN prescriptions p ON p.prescription_id = i.prescription_id WHERE p.patient_id = 1 AND p.status = 'ACTIVE') LIMIT 1");
    const due = (await call("GET", "/api/reminders/due", { as: "pat1" })).json.data;
    assert.ok(due.length >= 1 && due.every((r) => r.status === "PENDING"));
    assert.ok(due.some((r) => r.reminder_id === seed.reminder_id));
    await call("PATCH", `/api/reminders/${seed.reminder_id}/status`, { as: "pat1", body: { status: "SKIPPED" } });
    assert.ok(!(await call("GET", "/api/reminders/due", { as: "pat1" })).json.data.some((r) => r.reminder_id === seed.reminder_id));
    assert.equal((await call("GET", "/api/reminders/due", { as: "doc" })).status, 403);
});

test("login returns the pharmacy id for pharmacy staff (the frontend needs it)", async () => {
    const r = await call("POST", "/api/auth/login", { body: { email: "neha.patel@medsync.dev", password: PASSWORD } });
    assert.equal(r.json.data.user.pharmacy_id, 1);
    const d = await call("POST", "/api/auth/login", { body: { email: "ananya.rao@medsync.dev", password: PASSWORD } });
    assert.equal("pharmacy_id" in d.json.data.user, false);
});

test("CORS headers are only sent for the configured origin", async () => {
    const plain = await fetch(base + "/api/health", { headers: { Origin: "http://evil.example" } });
    assert.equal(plain.headers.get("access-control-allow-origin"), null);
});

test("admin: only admins reach /api/admin; admin creates a doctor who can sign in, and can deactivate them", async () => {
    for (const t of ["doc", "pat1", "staff1"]) assert.equal((await call("GET", "/api/admin/users", { as: t })).status, 403, t);
    assert.equal((await call("GET", "/api/admin/users")).status, 401);
    await login("admin", "admin@medsync.dev");
    const doc = { role: "DOCTOR", name: "Dr New", email: "dr.new@medsync.dev", password: "Strong@123", license_number: "LIC-NEW-1", specialization: "Cardiology" };
    const created = await call("POST", "/api/admin/users", { as: "admin", body: doc });
    assert.equal(created.status, 201);
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: doc })).status, 400, "duplicate email");
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: { ...doc, email: "x@medsync.dev" } })).status, 400, "duplicate license");
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: { ...doc, role: "ADMIN", email: "y@medsync.dev" } })).status, 400, "cannot create admins through the API");
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: { ...doc, email: "z@medsync.dev", license_number: "L2", password: "weak" } })).status, 400, "weak password");
    const staff = await call("POST", "/api/admin/users", { as: "admin", body: { role: "PHARMACY_STAFF", name: "New Staff", email: "staff.new@medsync.dev", password: "Strong@123", pharmacy_id: 1 } });
    assert.equal(staff.status, 201);
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: { role: "PHARMACY_STAFF", name: "N", email: "n@medsync.dev", password: "Strong@123", pharmacy_id: 9999 } })).status, 400);

    const l = await call("POST", "/api/auth/login", { body: { email: doc.email, password: doc.password } });
    assert.equal(l.status, 200);
    assert.equal(l.json.data.user.role, "DOCTOR");
    tokens.newdoc = l.json.data.token;
    const list = await call("GET", "/api/admin/users?role=DOCTOR&q=Dr%20New", { as: "admin" });
    assert.equal(list.json.data.items.length, 1);
    assert.equal(list.json.data.items[0].license_number, "LIC-NEW-1");

    const id = created.json.data.user_id;
    // admin password reset: validated, admin-only, signs the person out, new password works
    assert.equal((await call("POST", `/api/admin/users/${id}/password`, { as: "doc", body: { new_password: "Fresh@1234" } })).status, 403, "non-admins cannot reset");
    assert.equal((await call("POST", `/api/admin/users/${id}/password`, { as: "admin", body: { new_password: "weak" } })).status, 400, "weak reset password");
    assert.equal((await call("POST", "/api/admin/users/999999/password", { as: "admin", body: { new_password: "Fresh@1234" } })).status, 404);
    const adminId = (await call("GET", "/api/auth/me", { as: "admin" })).json.data.user.user_id;
    assert.equal((await call("POST", `/api/admin/users/${adminId}/password`, { as: "admin", body: { new_password: "Fresh@1234" } })).status, 403, "own password goes through My profile");
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal((await call("POST", `/api/admin/users/${id}/password`, { as: "admin", body: { new_password: "Fresh@1234" } })).status, 200);
    assert.equal((await call("GET", "/api/doctors/me", { as: "newdoc" })).status, 401, "old session ends after a reset");
    assert.equal((await call("POST", "/api/auth/login", { body: { email: doc.email, password: doc.password } })).status, 401, "old password stops working");
    const l2 = await call("POST", "/api/auth/login", { body: { email: doc.email, password: "Fresh@1234" } });
    assert.equal(l2.status, 200, "new password works");
    assert.equal((await call("PATCH", `/api/admin/users/${id}/active`, { as: "admin", body: { is_active: false } })).status, 200);
    assert.equal((await call("GET", "/api/doctors/me", { as: "newdoc" })).status, 401, "old token stops working immediately");
    assert.equal((await call("POST", "/api/auth/login", { body: { email: doc.email, password: doc.password } })).status, 401);
    const me = (await call("GET", "/api/auth/me", { as: "admin" })).json.data.user.user_id;
    assert.equal((await call("PATCH", `/api/admin/users/${me}/active`, { as: "admin", body: { is_active: false } })).status, 403, "cannot lock yourself out");
    assert.equal((await call("PATCH", `/api/admin/users/${id}/active`, { as: "admin", body: { is_active: "no" } })).status, 400);

    const ph = await call("POST", "/api/admin/pharmacies", { as: "admin", body: { name: "Test Pharmacy", address: "1 Road", phone: "999" } });
    assert.equal(ph.status, 201);
    const sum = await call("GET", "/api/admin/summary", { as: "admin" });
    assert.ok(sum.json.data.doctors >= 3);
    const audit = await pool.query("SELECT action FROM audit_logs WHERE action IN ('USER_CREATE','USER_DEACTIVATE','PHARMACY_CREATE')");
    assert.ok(audit[0].length >= 4);
});

test("profile: own details per role; edit name/phone (patients also address); role fields cannot be self-edited", async () => {
    const d = (await call("GET", "/api/auth/me", { as: "doc" })).json.data.user;
    assert.equal(d.role, "DOCTOR"); assert.ok(d.profile.license_number && d.profile.specialization);
    const s = (await call("GET", "/api/auth/me", { as: "staff1" })).json.data.user;
    assert.ok(s.profile.pharmacy_name);
    const lic = d.profile.license_number;
    const upd = await call("PUT", "/api/auth/me", { as: "doc", body: { name: d.name, phone: "9876543210", license_number: "HACKED", role: "ADMIN", email: "x@y.com" } });
    assert.equal(upd.status, 200);
    const after = (await call("GET", "/api/auth/me", { as: "doc" })).json.data.user;
    assert.equal(after.phone, "9876543210"); assert.equal(after.profile.license_number, lic); assert.equal(after.role, "DOCTOR"); assert.equal(after.email, d.email);
    assert.equal((await call("PUT", "/api/auth/me", { as: "doc", body: { name: "" } })).status, 400);
    const p = await call("PUT", "/api/auth/me", { as: "pat1", body: { name: "Arjun Kumar", phone: "1", date_of_birth: "1990-02-03", gender: "Male", address: "New address" } });
    assert.equal(p.status, 200); assert.equal(p.json.data.user.profile.address, "New address");
    assert.equal((await call("PUT", "/api/auth/me", { as: "pat1", body: { name: "Arjun", date_of_birth: "not-a-date" } })).status, 400);
    assert.equal((await call("PUT", "/api/auth/me")).status, 401);
});

test("password change: needs the current password, signs out older tokens, is audited and throttled", async () => {
    const reg = await call("POST", "/api/auth/register", { body: { name: "Pw Tester", email: "pw@medsync.dev", password: "Original@1", date_of_birth: "1999-01-01" } });
    assert.equal(reg.status, 201);
    await pool.query("UPDATE users SET email_verified_at = NOW() WHERE email = 'pw@medsync.dev'"); // new patients must verify their email before signing in
    const first = await call("POST", "/api/auth/login", { body: { email: "pw@medsync.dev", password: "Original@1" } });
    tokens.pw = first.json.data.token;
    assert.equal((await call("PUT", "/api/auth/password", { body: { current_password: "Original@1", new_password: "Newer@123" } })).status, 401);
    assert.equal((await call("PUT", "/api/auth/password", { as: "pw", body: { current_password: "wrong", new_password: "Newer@123" } })).status, 400);
    assert.equal((await call("PUT", "/api/auth/password", { as: "pw", body: { current_password: "Original@1", new_password: "short" } })).status, 400);
    assert.equal((await call("PUT", "/api/auth/password", { as: "pw", body: { current_password: "Original@1", new_password: "Original@1" } })).status, 400);
    await new Promise((r) => setTimeout(r, 1100)); // so the old token's issue time is earlier than the change
    const ok = await call("PUT", "/api/auth/password", { as: "pw", body: { current_password: "Original@1", new_password: "Newer@123" } });
    assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/api/auth/me", { as: "pw" })).status, 401, "old token is dead");
    tokens.pwNew = ok.json.data.token;
    assert.equal((await call("GET", "/api/auth/me", { as: "pwNew" })).status, 200, "fresh token works");
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "pw@medsync.dev", password: "Original@1" } })).status, 401);
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "pw@medsync.dev", password: "Newer@123" } })).status, 200);
    const [[a]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('PASSWORD_CHANGE','PASSWORD_CHANGE_FAILED')");
    assert.ok(a.n >= 2);
    for (let i = 0; i < 5; i++) await call("PUT", "/api/auth/password", { as: "pwNew", body: { current_password: "nope", new_password: "Another@123" } });
    assert.equal((await call("PUT", "/api/auth/password", { as: "pwNew", body: { current_password: "Newer@123", new_password: "Another@123" } })).status, 429, "throttled after repeated wrong guesses");
});

test("pharmacy dispensing: checks stock, rejects insufficient, allocates FEFO, and updates status", async () => {
    // 1. Doctor creates a new prescription for Arjun (pat1)
    const rx = await call("POST", "/api/prescriptions", {
        as: "doc",
        body: {
            patient_id: 1,
            prescription_date: inDays(0),
            items: [{ medicine_id: 2, dosage: "500 mg", frequency_per_day: 2, start_date: inDays(0), end_date: inDays(2) }] // 3 days * 2 = 6 units of medicine 2 (Amoxicillin)
        }
    });
    assert.equal(rx.status, 201);
    const rxId = rx.json.data.prescription_id;

    // 2. Pending prescriptions list includes rxId for pharmacy 1
    const pending = (await call("GET", "/api/pharmacies/1/prescriptions/pending", { as: "staff1" })).json.data;
    assert.ok(pending.some(p => p.prescription_id === rxId));

    // 3. Unauthorized access check: doc and pat cannot access pending
    assert.equal((await call("GET", "/api/pharmacies/1/prescriptions/pending", { as: "doc" })).status, 403);
    assert.equal((await call("GET", "/api/pharmacies/1/prescriptions/pending", { as: "staff2" })).status, 403);

    // 4. Add stock for medicine 2 in pharmacy 1:
    // Add batch with 10 units expiring in 30 days
    const b1 = await call("POST", "/api/pharmacies/1/batches", {
        as: "staff1",
        body: { medicine_id: 2, batch_number: "DISP-1", quantity: 10, expiry_date: inDays(30) }
    });
    assert.equal(b1.status, 201);

    // 5. Stock check reports sufficient
    const check = await call("GET", `/api/pharmacies/1/prescriptions/${rxId}/stock`, { as: "staff1" });
    assert.equal(check.status, 200);
    assert.equal(check.json.data.can_dispense, true);
    assert.equal(check.json.data.items[0].required_quantity, 6);

    // 6. Dispense successfully
    const disp = await call("POST", `/api/pharmacies/1/prescriptions/${rxId}/dispense`, { as: "staff1" });
    assert.equal(disp.status, 200);
    assert.equal(disp.json.data.status, "DISPENSED");
    assert.equal(disp.json.data.dispensed_items.length, 1);
    assert.equal(disp.json.data.dispensed_items[0].quantity, 6);

    // 7. Verify prescription details updated
    const rxDetail = (await call("GET", `/api/prescriptions/${rxId}`, { as: "staff1" })).json.data;
    assert.equal(rxDetail.status, "DISPENSED");
    assert.ok(rxDetail.dispensed_at);
    assert.equal(rxDetail.dispensed_items.length, 1);

    // 8. Cannot dispense again
    assert.equal((await call("POST", `/api/pharmacies/1/prescriptions/${rxId}/dispense`, { as: "staff1" })).status, 400);

    // 9. Doctor cannot cancel a dispensed prescription
    assert.equal((await call("POST", `/api/prescriptions/${rxId}/cancel`, { as: "doc" })).status, 400);

    // 10. Dispensations history shows the dispensed prescription
    const history = (await call("GET", "/api/pharmacies/1/dispensations", { as: "staff1" })).json.data;
    assert.ok(history.some(h => h.prescription_id === rxId));
});

test("notifications & cron: dispatch alerts, track history, and auto-transition overdue reminders to MISSED", async () => {
    // 1. Get a reminder for patient 1
    const reminders = (await call("GET", "/api/reminders", { as: "pat1" })).json.data;
    assert.ok(reminders.length >= 1);
    const rId = reminders[0].reminder_id;

    // 2. Dispatch reminder test notification
    const notifyRes = await call("POST", `/api/reminders/${rId}/notify`, {
        as: "pat1",
        body: { channels: ["EMAIL"] }
    });
    assert.equal(notifyRes.status, 200);
    assert.equal(notifyRes.json.data[0].status, "SENT");
    assert.equal(notifyRes.json.data[0].channel, "EMAIL");

    // 3. Patient notification history
    const notifs = await call("GET", "/api/patients/me/notifications", { as: "pat1" });
    assert.equal(notifs.status, 200);
    assert.ok(notifs.json.data.some(n => n.reminder_id === rId));

    // 4. Admin triggers automated cron cycle
    const cron = await call("POST", "/api/admin/cron/run", { as: "admin" });
    assert.equal(cron.status, 200);
    assert.ok(cron.json.data.timestamp);

    // 5. Non-admin cannot run cron
    assert.equal((await call("POST", "/api/admin/cron/run", { as: "pat1" })).status, 403);
});

test("enterprise session security: refresh token rotation and theft detection", async () => {
    // 1. Login returns token and refreshToken
    const res = await call("POST", "/api/auth/login", {
        body: { email: "ananya.rao@medsync.dev", password: "Test@12345" }
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.token);
    assert.ok(res.json.data.refreshToken);

    const oldRefresh = res.json.data.refreshToken;

    // 2. Refresh rotates tokens
    const refreshed = await call("POST", "/api/auth/refresh", {
        body: { refreshToken: oldRefresh }
    });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.json.data.token);
    assert.ok(refreshed.json.data.refreshToken);
    const newRefresh = refreshed.json.data.refreshToken;
    assert.notEqual(oldRefresh, newRefresh);

    // 3. New access token is valid
    tokens.rotatedDoc = refreshed.json.data.token;
    const me = await call("GET", "/api/auth/me", { as: "rotatedDoc" });
    assert.equal(me.status, 200);

    // 4. Reuse detection: using the old already-used token triggers theft detection
    const reuse = await call("POST", "/api/auth/refresh", {
        body: { refreshToken: oldRefresh }
    });
    assert.equal(reuse.status, 401);

    // 5. Because theft was detected, the entire session family was invalidated
    const postTheft = await call("POST", "/api/auth/refresh", {
        body: { refreshToken: newRefresh }
    });
    assert.equal(postTheft.status, 401);
});

test("external drug database: searches NIH RxNorm and fetches clinical forms with fallback", async () => {
    // 1. Unauthenticated rejected
    assert.equal((await call("GET", "/api/medicines/external/search?q=aspirin")).status, 401);

    // 2. Doctor searches RxNorm
    const search = await call("GET", "/api/medicines/external/search?q=aspirin", { as: "doc" });
    assert.equal(search.status, 200);
    assert.ok(search.json.data.source);
    assert.ok(Array.isArray(search.json.data.results));

    // 3. Clinical forms lookup
    const forms = await call("GET", "/api/medicines/external/forms?name=aspirin", { as: "doc" });
    assert.equal(forms.status, 200);
    assert.ok(forms.json.data.source);
    assert.ok(Array.isArray(forms.json.data.forms));
});

test("doctors see a patient's current medicines from ALL doctors (no other doctor's diagnosis) and the cross-doctor interaction check is access-controlled", async () => {
    const item = (medicine_id, days) => ({ medicine_id, dosage: "1 tab", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(days) });
    const other = await call("POST", "/api/prescriptions", { as: "doc2", body: { patient_id: 3, prescription_date: inDays(0), diagnosis: "SECRET-DIAGNOSIS", notes: "SECRET-NOTE", items: [item(1, 5)] } });
    assert.equal(other.status, 201);
    const otherId = other.json.data.prescription_id;

    const cur = await call("GET", "/api/doctors/patients/3/current-medicines", { as: "doc" });
    assert.equal(cur.status, 200);
    const mine = cur.json.data.find((m) => m.prescription_id === otherId);
    assert.ok(mine, "Dr 2's medicine is visible to Dr 1");
    assert.equal(mine.medicine_name, "Paracetamol"); assert.equal(mine.prescribed_by_me, false); assert.ok(mine.doctor_name);
    assert.ok(!JSON.stringify(cur.json).includes("SECRET"), "diagnosis and notes of other doctors are not exposed");
    const own = await call("GET", "/api/doctors/patients/3/current-medicines", { as: "doc2" });
    assert.equal(own.json.data.find((m) => m.prescription_id === otherId).prescribed_by_me, true);

    // Ibuprofen (3) interacts with the Paracetamol (1) another doctor prescribed
    const chk = await call("GET", "/api/interactions/check?medicineIds=3&patientId=3", { as: "doc" });
    assert.equal(chk.status, 200);
    assert.equal(chk.json.data.length, 1);
    assert.equal(chk.json.data[0].existing_medication.medicine_name, "Paracetamol");
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=5&patientId=3", { as: "doc" })).json.data.length, 0);

    // that check reveals the patient's medicines, so it is limited: doctors, or the patient themselves
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3&patientId=3", { as: "staff1" })).status, 403, "pharmacy staff cannot look up a patient's medicines this way");
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3&patientId=3", { as: "pat1" })).status, 404, "a patient cannot probe another patient");
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3&patientId=1", { as: "pat1" })).status, 200, "a patient can check against their own medicines");
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3,1", { as: "staff1" })).status, 200, "plain pair check stays open to all roles");

    // access control and unknown patient
    for (const t of ["pat1", "staff1"]) assert.equal((await call("GET", "/api/doctors/patients/3/current-medicines", { as: t })).status, 403, t);
    assert.equal((await call("GET", "/api/doctors/patients/9999/current-medicines", { as: "doc" })).status, 404);
    const [[a]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'PATIENT_MEDICINES_VIEW'");
    assert.ok(a.n >= 2, "views are audited");

    // cancelled prescriptions are no longer "current"
    assert.equal((await call("POST", `/api/prescriptions/${otherId}/cancel`, { as: "doc2" })).status, 200);
    const after = await call("GET", "/api/doctors/patients/3/current-medicines", { as: "doc" });
    assert.ok(!after.json.data.some((m) => m.prescription_id === otherId));
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3&patientId=3", { as: "doc" })).json.data.length, 0);
});

test("paging: user list, patient search and inventory return one page plus a has-more flag", async () => {
    // users: 25 per page by default; asking for limit=2 gives a next page
    const u1 = (await call("GET", "/api/admin/users?limit=2&page=1", { as: "admin" })).json.data;
    assert.equal(u1.items.length, 2); assert.equal(u1.has_more, true);
    const u2 = (await call("GET", "/api/admin/users?limit=2&page=2", { as: "admin" })).json.data;
    assert.notEqual(u1.items[0].user_id, u2.items[0].user_id);
    const all = (await call("GET", "/api/admin/users?limit=100", { as: "admin" })).json.data;
    assert.equal(all.has_more, false);

    // patient search: still an array in `data`, with meta.has_more
    const s1 = await call("GET", "/api/doctors/patients?q=ar&limit=1", { as: "doc" });
    assert.equal(s1.status, 200); assert.ok(Array.isArray(s1.json.data)); assert.equal(typeof s1.json.meta.has_more, "boolean");

    // inventory: page + totals for ALL batches; without paging parameters the old full list is returned
    const full = (await call("GET", "/api/pharmacies/1/inventory", { as: "staff1" })).json;
    assert.ok(Array.isArray(full.data) && !full.meta);
    const pg = (await call("GET", "/api/pharmacies/1/inventory?limit=2&page=1", { as: "staff1" })).json;
    assert.equal(pg.data.length, 2); assert.equal(pg.meta.has_more, full.data.length > 2);
    assert.equal(pg.meta.summary.batches, full.data.length);
    assert.equal(pg.meta.summary.expired, full.data.filter((b) => b.inventory_status === "EXPIRED").length);
    const q = (await call("GET", "/api/pharmacies/1/inventory?q=Paracetamol&limit=20", { as: "staff1" })).json.data;
    assert.ok(q.every((b) => b.name === "Paracetamol"));
    assert.equal((await call("GET", "/api/pharmacies/1/inventory?limit=2", { as: "staff2" })).status, 403);
});

test("removed batches are hidden (history kept); patients can add upcoming extra reminders and delete only upcoming unanswered ones", async () => {
    // --- soft delete: a batch that was dispensed can still be "removed" and vanishes from every list
    const mk = await call("POST", "/api/pharmacies/1/batches", { as: "staff1", body: { medicine_id: 4, batch_number: "SOFT-1", quantity: 5, expiry_date: inDays(20) } });
    assert.equal(mk.status, 201);
    const bid = mk.json.data.batch_id;
    await pool.query("UPDATE prescriptions SET status='ACTIVE' WHERE prescription_id = 1");
    await pool.query("INSERT INTO dispensed_items (prescription_id, prescription_item_id, batch_id, quantity, dispensed_by, pharmacy_id) SELECT 1, MIN(prescription_item_id), ?, 1, user_id, 1 FROM prescription_items, (SELECT user_id FROM users WHERE email='neha.patel@medsync.dev') u WHERE prescription_id = 1", [bid]);
    assert.equal((await call("DELETE", `/api/batches/${bid}`, { as: "staff2" })).status, 403);
    assert.equal((await call("DELETE", `/api/batches/${bid}`, { as: "staff1" })).status, 204, "dispensed batch can be removed");
    const inv = (await call("GET", "/api/pharmacies/1/inventory", { as: "staff1" })).json.data;
    assert.ok(!inv.some((b) => b.batch_id === bid));
    assert.ok(!(await call("GET", "/api/pharmacies/1/inventory?limit=50", { as: "staff1" })).json.data.some((b) => b.batch_id === bid));
    assert.equal((await call("PATCH", `/api/batches/${bid}/quantity`, { as: "staff1", body: { quantity_change: 1 } })).status, 404, "removed batch cannot be changed");
    const [[kept]] = await pool.query("SELECT COUNT(*) n FROM dispensed_items WHERE batch_id = ?", [bid]);
    assert.equal(kept.n, 1, "dispensing record kept");
    const back = await call("POST", "/api/pharmacies/1/batches", { as: "staff1", body: { medicine_id: 4, batch_number: "SOFT-1", quantity: 7, expiry_date: inDays(25) } });
    assert.equal(back.status, 201); assert.equal(back.json.data.batch_id, bid, "same number revives the removed batch");
    assert.equal((await call("POST", "/api/pharmacies/1/batches", { as: "staff1", body: { medicine_id: 4, batch_number: "SOFT-1", quantity: 7, expiry_date: inDays(25) } })).status, 409, "live duplicate still refused");

    // --- reminders
    const [[item]] = await pool.query("SELECT pi.prescription_item_id id FROM prescription_items pi JOIN prescriptions p ON p.prescription_id = pi.prescription_id WHERE p.patient_id = 1 AND p.status IN ('ACTIVE','DISPENSED') AND pi.end_date >= CURDATE() AND pi.start_date <= CURDATE() LIMIT 1");
    const itemId = item.id;
    const [[end]] = await pool.query("SELECT end_date FROM prescription_items WHERE prescription_item_id = ?", [itemId]);
    const endDay = new Date(end.end_date); const ed = `${endDay.getFullYear()}-${p2(endDay.getMonth() + 1)}-${p2(endDay.getDate())}`;
    const slot = `${ed} 23:59:00`;
    await pool.query("DELETE FROM reminders WHERE prescription_item_id = ? AND scheduled_at = ?", [itemId, slot]);
    const add = await call("POST", "/api/reminders", { as: "pat1", body: { prescription_item_id: itemId, scheduled_at: slot } });
    assert.equal(add.status, 201);
    assert.equal((await call("POST", "/api/reminders", { as: "pat1", body: { prescription_item_id: itemId, scheduled_at: slot } })).status, 409, "duplicate slot");
    assert.equal((await call("POST", "/api/reminders", { as: "pat1", body: { prescription_item_id: itemId, scheduled_at: `${inDays(-30)} 08:00` } })).status, 400, "in the past");
    assert.equal((await call("POST", "/api/reminders", { as: "pat1", body: { prescription_item_id: itemId, scheduled_at: `${inDays(900)} 08:00` } })).status, 400, "after the course");
    assert.equal((await call("POST", "/api/reminders", { as: "pat2", body: { prescription_item_id: itemId, scheduled_at: `${ed} 23:58:00` } })).status, 404, "someone else's medicine");
    const rid = add.json.data.reminder_id;
    assert.equal((await call("DELETE", `/api/reminders/${rid}`, { as: "pat2" })).status, 404);
    await call("PATCH", `/api/reminders/${rid}/status`, { as: "pat1", body: { status: "TAKEN" } });
    assert.equal((await call("DELETE", `/api/reminders/${rid}`, { as: "pat1" })).status, 400, "answered doses stay in the record");
    await call("PATCH", `/api/reminders/${rid}/status`, { as: "pat1", body: { status: "PENDING" } });
    assert.equal((await call("DELETE", `/api/reminders/${rid}`, { as: "pat1" })).status, 204, "upcoming unanswered can be deleted");
    const [[old]] = await pool.query("SELECT reminder_id id FROM reminders r JOIN prescription_items i ON i.prescription_item_id = r.prescription_item_id JOIN prescriptions p ON p.prescription_id = i.prescription_id WHERE p.patient_id = 1 AND r.status = 'MISSED' LIMIT 1");
    if (old) assert.equal((await call("DELETE", `/api/reminders/${old.id}`, { as: "pat1" })).status, 400, "missed doses cannot be deleted");
});

test("lockouts are kept in the database, so they survive a restart; they expire after the window", async () => {
    await throttle.resetAllThrottles();
    const bad = () => call("POST", "/api/auth/login", { body: { email: "restart@medsync.dev", password: "bad" } });
    for (let i = 0; i < 5; i++) await bad();
    assert.equal((await bad()).status, 429);
    const [[row]] = await pool.query("SELECT attempts FROM throttle_attempts WHERE scope = 'login'");
    assert.equal(row.attempts, 5, "counter is stored in the database");
    // a restart empties process memory but not the table: the next request is still blocked
    assert.equal((await bad()).status, 429, "still locked after a restart");
    // after the window passes the counter starts again
    await pool.query("UPDATE throttle_attempts SET reset_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE scope = 'login'");
    assert.equal((await bad()).status, 401, "window over: attempts allowed again");
    const [[again]] = await pool.query("SELECT attempts FROM throttle_attempts WHERE scope = 'login'");
    assert.equal(again.attempts, 1);
    await throttle.resetAllThrottles();
});

test("appointments: request, double-booking, confirm, decline, reschedule, cancel, ownership", async () => {
    const docs = (await call("GET", "/api/appointments/doctors", { as: "pat1" })).json.data;
    assert.ok(docs.length >= 2);
    assert.equal((await call("GET", "/api/appointments/doctors", { as: "doc" })).status, 403, "doctors cannot use the patient's doctor list");
    const [[d1]] = await pool.query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = 'ananya.rao@medsync.dev'");
    const day = inDays(20);
    const ask = (as, at, extra = {}) => call("POST", "/api/appointments", { as, body: { doctor_id: d1.doctor_id, scheduled_at: `${day} ${at}`, reason: "Follow-up visit", ...extra } });

    // validation
    assert.equal((await ask("pat1", "10:15")).status, 400, "not on the half hour");
    assert.equal((await ask("pat1", "06:00")).status, 400, "outside clinic hours");
    assert.equal((await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d1.doctor_id, scheduled_at: `${inDays(-2)} 10:00`, reason: "Past" } })).status, 400, "past");
    assert.equal((await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d1.doctor_id, scheduled_at: `${inDays(200)} 10:00`, reason: "Far" } })).status, 400, "too far ahead");
    assert.equal((await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: 99999, scheduled_at: `${day} 10:00`, reason: "Nobody" } })).status, 404);
    assert.equal((await ask("doc", "10:00")).status, 403, "doctors cannot book");

    const a = await ask("pat1", "10:00");
    assert.equal(a.status, 201);
    assert.equal(a.json.data.status, "REQUESTED");
    const id = a.json.data.appointment_id;
    assert.equal((await ask("pat1", "10:00")).status, 409, "same patient, same time");

    // ownership: the other patient and the other doctor get 404
    assert.equal((await call("POST", `/api/appointments/${id}/cancel`, { as: "pat2" })).status, 404);
    assert.equal((await call("POST", `/api/appointments/${id}/confirm`, { as: "doc2" })).status, 404);
    assert.equal((await call("GET", "/api/appointments", { as: "pat2" })).json.data.some((x) => x.appointment_id === id), false);
    assert.equal((await call("GET", "/api/appointments", { as: "doc2" })).json.data.some((x) => x.appointment_id === id), false);
    assert.equal((await call("GET", "/api/appointments?status=REQUESTED", { as: "doc" })).json.data.some((x) => x.appointment_id === id), true);
    assert.equal((await call("GET", "/api/appointments?status=NOPE", { as: "doc" })).status, 400);

    // doctor confirms; the slot is now taken for others
    assert.equal((await call("POST", `/api/appointments/${id}/confirm`, { as: "pat1" })).status, 403, "patients cannot confirm");
    const c = await call("POST", `/api/appointments/${id}/confirm`, { as: "doc", body: { note: "See you then" } });
    assert.equal(c.status, 200);
    assert.equal(c.json.data.status, "CONFIRMED");
    assert.equal((await call("POST", `/api/appointments/${id}/confirm`, { as: "doc" })).status, 409, "already confirmed");
    assert.equal((await ask("pat2", "10:00")).status, 409, "confirmed slot is taken");

    // a second request for another time: decline needs a note
    const b = (await ask("pat2", "11:00")).json.data;
    assert.equal((await call("POST", `/api/appointments/${b.appointment_id}/decline`, { as: "doc", body: {} })).status, 400, "decline needs a reason");
    const dec = await call("POST", `/api/appointments/${b.appointment_id}/decline`, { as: "doc", body: { note: "On leave that day" } });
    assert.equal(dec.json.data.status, "DECLINED");
    assert.equal((await call("POST", `/api/appointments/${b.appointment_id}/cancel`, { as: "pat2" })).status, 409, "declined cannot be cancelled");
    assert.equal((await ask("pat2", "10:00")).status, 409);

    // reschedule: moves to a free slot and stays confirmed; busy slot refused
    const r1 = await call("POST", `/api/appointments/${id}/reschedule`, { as: "doc", body: { scheduled_at: `${day} 10:00` } });
    assert.equal(r1.status, 200, "a doctor may re-confirm the same time slot for the same appointment");
    const other = (await ask("pat2", "14:00")).json.data;
    await call("POST", `/api/appointments/${other.appointment_id}/confirm`, { as: "doc" });
    assert.equal((await call("POST", `/api/appointments/${id}/reschedule`, { as: "doc", body: { scheduled_at: `${day} 14:00` } })).status, 409, "doctor busy");
    const r2 = await call("POST", `/api/appointments/${id}/reschedule`, { as: "doc", body: { scheduled_at: `${day} 15:30`, note: "Moved" } });
    assert.equal(r2.json.data.scheduled_at, `${day} 15:30`);
    assert.equal(r2.json.data.status, "CONFIRMED");

    // patient cancels; the slot frees up
    assert.equal((await call("POST", `/api/appointments/${id}/cancel`, { as: "pat1" })).json.data.status, "CANCELLED");
    assert.equal((await ask("pat2", "15:30")).status, 201, "freed slot can be booked again");

    // cannot complete a future appointment
    assert.equal((await call("POST", `/api/appointments/${other.appointment_id}/complete`, { as: "doc" })).status, 409);

    // notices were recorded for the other party
    let n = 0; // notices are sent in the background, so give them a moment
    for (let i = 0; i < 20 && n < 3; i++) {
        [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE title LIKE 'Appointment %' OR title LIKE 'New appointment%'");
        if (n < 3) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(n >= 3);
});

test("appointments: a patient can have at most 5 upcoming; completing a started appointment works", async () => {
    const [[d2]] = await pool.query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = 'rahul.mehta@medsync.dev'");
    await pool.query("DELETE FROM appointments");
    for (let i = 0; i < 5; i++) {
        const r = await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d2.doctor_id, scheduled_at: `${inDays(30 + i)} 09:00`, reason: "Routine check" } });
        assert.equal(r.status, 201);
    }
    assert.equal((await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d2.doctor_id, scheduled_at: `${inDays(40)} 09:00`, reason: "One too many" } })).status, 409);

    // an appointment whose time has begun can be completed
    const first = (await call("GET", "/api/appointments", { as: "doc2" })).json.data[0];
    await call("POST", `/api/appointments/${first.appointment_id}/confirm`, { as: "doc2" });
    await pool.query("UPDATE appointments SET scheduled_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE appointment_id = ?", [first.appointment_id]);
    const done = await call("POST", `/api/appointments/${first.appointment_id}/complete`, { as: "doc2", body: { note: "Seen" } });
    assert.equal(done.json.data.status, "COMPLETED");
    assert.equal((await call("GET", "/api/appointments?when=past", { as: "pat1" })).json.data.length, 1);
    await pool.query("DELETE FROM appointments");
});

test("search: needs a sign-in and 2+ characters; each role sees only its own records", async () => {
    assert.equal((await call("GET", "/api/search?q=para")).status, 401);
    assert.equal((await call("GET", "/api/search?q=a", { as: "pat1" })).status, 400);
    assert.equal((await call("GET", "/api/search", { as: "pat1" })).status, 400);
    const find = async (as, q) => (await call("GET", `/api/search?q=${encodeURIComponent(q)}`, { as })).json.data;
    const titles = (groups) => groups.flatMap((g) => g.items.map((i) => `${g.group}:${i.title}`));

    // a private record: patient 2, written by doctor 2
    const [[p2]] = await pool.query("SELECT p.patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'priya.sharma@medsync.dev'");
    const [[d2]] = await pool.query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = 'rahul.mehta@medsync.dev'");
    const [ins] = await pool.query("INSERT INTO prescriptions (doctor_id, patient_id, prescription_date, diagnosis) VALUES (?, ?, CURDATE(), 'Zebra syndrome')", [d2.doctor_id, p2.patient_id]);
    assert.ok(titles(await find("pat2", "zebra")).includes("Prescriptions:Zebra syndrome"), "owner patient finds it");
    assert.ok(titles(await find("doc2", "zebra")).includes("Prescriptions:Zebra syndrome"), "writing doctor finds it");
    assert.deepEqual(await find("pat1", "zebra"), [], "another patient finds nothing");
    assert.deepEqual(await find("doc", "zebra"), [], "another doctor finds nothing");
    assert.deepEqual(await find("staff1", "zebra"), [], "pharmacy staff do not search prescriptions");
    assert.equal((await find("doc", "priya")).find((g) => g.group === "Patients").items[0].tab, "patients", "doctors can find patients by name");

    // medicines for everyone, stock only for the staff's own pharmacy, users only for admin
    assert.ok(titles(await find("pat1", "amlod")).some((t) => t.startsWith("Medicines:Amlodipine")));
    assert.ok((await find("staff1", "amlod")).some((g) => g.group === "Medicines" && g.items[0].tab === "catalog"));
    await login("admin", "admin@medsync.dev");
    assert.ok((await find("admin", "ananya")).find((g) => g.group === "Users").items.length >= 1);
    assert.equal((await find("pat1", "ananya")).some((g) => g.group === "Users"), false, "patients cannot search users");
    assert.equal((await find("doc", "ananya")).some((g) => g.group === "Users"), false);

    // stock is scoped to the staff member's own pharmacy
    const [[mine]] = await pool.query("SELECT pharmacy_id FROM pharmacy_staff ps JOIN users u ON u.user_id = ps.user_id WHERE u.email = 'neha.patel@medsync.dev'");
    const [[other]] = await pool.query("SELECT pharmacy_id FROM pharmacy_staff ps JOIN users u ON u.user_id = ps.user_id WHERE u.email = 'amit.verma@medsync.dev'");
    if (mine.pharmacy_id !== other.pharmacy_id) {
        await pool.query("INSERT INTO medicine_batches (medicine_id, pharmacy_id, batch_number, quantity, expiry_date) VALUES (1, ?, 'SRCH-ONLY-HERE', 5, DATE_ADD(CURDATE(), INTERVAL 1 YEAR))", [mine.pharmacy_id]);
        assert.ok(titles(await find("staff1", "SRCH-ONLY")).length === 1);
        assert.deepEqual(await find("staff2", "SRCH-ONLY"), []);
        await pool.query("DELETE FROM medicine_batches WHERE batch_number = 'SRCH-ONLY-HERE'");
    }

    // % and _ are plain text, not wildcards
    assert.deepEqual(await find("doc", "%%"), [], "a wildcard does not match everything");
    await pool.query("DELETE FROM prescriptions WHERE prescription_id = ?", [ins.insertId]);
});

// ---- real email / SMS delivery, against a fake mail server and a fake SMS provider ----
function fakeSmtp() {
    const net = require("node:net");
    const state = { mails: [], rejectRcpt: false };
    const server = net.createServer((sock) => {
        let buf = "", data = null, current = { rcpt: [], body: "" };
        sock.write("220 fake ESMTP\r\n");
        sock.on("data", (chunk) => {
            buf += chunk.toString();
            for (;;) {
                if (data !== null) {
                    const end = buf.indexOf("\r\n.\r\n");
                    if (end < 0) return;
                    current.body = buf.slice(0, end); buf = buf.slice(end + 5); data = null;
                    state.mails.push(current); current = { rcpt: [], body: "" };
                    sock.write("250 queued\r\n"); continue;
                }
                const nl = buf.indexOf("\r\n");
                if (nl < 0) return;
                const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
                const cmd = line.slice(0, 4).toUpperCase();
                if (cmd === "EHLO" || cmd === "HELO") sock.write("250-fake\r\n250 OK\r\n");
                else if (cmd === "MAIL") sock.write("250 OK\r\n");
                else if (cmd === "RCPT") { if (state.rejectRcpt) sock.write("550 mailbox unavailable\r\n"); else { current.rcpt.push(line); sock.write("250 OK\r\n"); } }
                else if (cmd === "DATA") { data = ""; sock.write("354 go\r\n"); }
                else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
                else sock.write("250 OK\r\n");
            }
        });
        sock.on("error", () => {});
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state, port: server.address().port })));
}
function fakeSms() {
    const state = { requests: [], status: 201 };
    const server = require("node:http").createServer((req, res) => {
        let body = ""; req.on("data", (c) => { body += c; });
        req.on("end", () => {
            state.requests.push({ url: req.url, auth: req.headers.authorization, form: Object.fromEntries(new URLSearchParams(body)) });
            res.writeHead(state.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(state.status < 300 ? { sid: "SM1" } : { message: "The number is unverified" }));
        });
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state, port: server.address().port })));
}
const waitFor = async (fn, ms = 3000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise((r) => setTimeout(r, 50)); } };

test("email and SMS: nothing is sent until configured; then real messages go out; failures are recorded", async () => {
    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_API_BASE"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const smtp = await fakeSmtp(), sms = await fakeSms();
    try {
        await login("admin", "admin@medsync.dev");
        for (const k of keys) delete process.env[k];

        // 1. not configured: the admin sees that, a test is refused, and a booking still works
        const off = (await call("GET", "/api/admin/delivery", { as: "admin" })).json.data;
        assert.equal(off.email.configured, false);
        assert.equal(off.sms.configured, false);
        assert.equal((await call("POST", "/api/admin/delivery/test", { as: "admin", body: { channel: "EMAIL" } })).status, 400);
        assert.equal((await call("POST", "/api/admin/delivery/test", { as: "admin", body: { channel: "FAX" } })).status, 400);
        assert.equal((await call("GET", "/api/admin/delivery", { as: "pat1" })).status, 403);
        assert.equal((await call("POST", "/api/admin/delivery/test", { as: "doc", body: { channel: "EMAIL" } })).status, 403);

        // 2. email configured: a real message reaches the (fake) mail server
        process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = String(smtp.port); process.env.SMTP_PASS = "super-secret-pass";
        const on = await call("GET", "/api/admin/delivery", { as: "admin" });
        assert.equal(on.json.data.email.configured, true);
        assert.ok(!JSON.stringify(on.json).includes("super-secret-pass"), "no secret is ever shown");
        assert.equal((await call("POST", "/api/admin/delivery/test", { as: "admin", body: { channel: "EMAIL" } })).status, 200);
        assert.equal(smtp.state.mails.length, 1);
        assert.match(smtp.state.mails[0].rcpt[0], /admin@medsync\.dev/);
        assert.match(smtp.state.mails[0].body, /MedSync test message/);

        const [[d1]] = await pool.query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = 'ananya.rao@medsync.dev'");
        await pool.query("DELETE FROM appointments");
        const booked = await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d1.doctor_id, scheduled_at: `${inDays(12)} 09:30`, reason: "Mail check" } });
        assert.equal(booked.status, 201, "booking is not held up by mail");
        assert.ok(await waitFor(() => smtp.state.mails.length === 2), "the doctor was emailed about the request");
        assert.match(smtp.state.mails[1].rcpt[0], /ananya\.rao@medsync\.dev/);
        assert.match(smtp.state.mails[1].body, /New appointment request/);
        const [[row]] = await pool.query("SELECT status FROM notifications WHERE title = 'New appointment request' ORDER BY notification_id DESC LIMIT 1");
        assert.equal(row.status, "SENT");

        // 3. the mail server refuses: the notice is recorded as FAILED with the reason, and booking still works
        smtp.state.rejectRcpt = true;
        const again = await call("POST", "/api/appointments", { as: "pat1", body: { doctor_id: d1.doctor_id, scheduled_at: `${inDays(12)} 10:00`, reason: "Mail refused" } });
        assert.equal(again.status, 201);
        const failed = await waitFor(async () => (await pool.query("SELECT status, error_message FROM notifications WHERE status = 'FAILED' ORDER BY notification_id DESC LIMIT 1"))[0][0]);
        assert.ok(failed && /550|mailbox/i.test(failed.error_message), "reason is kept");
        assert.equal((await call("POST", "/api/admin/delivery/test", { as: "admin", body: { channel: "EMAIL" } })).status, 502, "a failing test tells the admin");
        await pool.query("DELETE FROM appointments");

        // 4. SMS configured: normalised number, basic auth, and the provider's refusal is recorded
        process.env.TWILIO_ACCOUNT_SID = "ACtest"; process.env.TWILIO_AUTH_TOKEN = "tok"; process.env.TWILIO_FROM = "+15550001111"; process.env.TWILIO_API_BASE = `http://127.0.0.1:${sms.port}`;
        const [[rem]] = await pool.query("SELECT r.reminder_id FROM reminders r JOIN prescription_items i ON i.prescription_item_id = r.prescription_item_id JOIN prescriptions p ON p.prescription_id = i.prescription_id WHERE p.patient_id = 1 LIMIT 1");
        await pool.query("UPDATE users SET phone = '98765 43210' WHERE email = 'arjun.kumar@medsync.dev'");
        const sent = await call("POST", `/api/reminders/${rem.reminder_id}/notify`, { as: "pat1", body: { channels: ["SMS"] } });
        assert.equal(sent.status, 200);
        assert.equal(sent.json.data[0].status, "SENT");
        assert.equal(sms.state.requests.length, 1);
        assert.equal(sms.state.requests[0].form.To, "+919876543210");
        assert.equal(sms.state.requests[0].form.From, "+15550001111");
        assert.equal(sms.state.requests[0].auth, `Basic ${Buffer.from("ACtest:tok").toString("base64")}`);
        sms.state.status = 400;
        const refused = await call("POST", `/api/reminders/${rem.reminder_id}/notify`, { as: "pat1", body: { channels: ["SMS"] } });
        assert.equal(refused.json.data[0].status, "FAILED");
        const [[why]] = await pool.query("SELECT error_message FROM notifications WHERE status = 'FAILED' AND channel = 'SMS' ORDER BY notification_id DESC LIMIT 1");
        assert.match(why.error_message, /refused.*400.*unverified/);

        // 5. the notify route is for the reminder's own patient, with known channels only
        assert.equal((await call("POST", `/api/reminders/${rem.reminder_id}/notify`, { as: "pat2", body: {} })).status, 404, "another patient cannot trigger it");
        assert.equal((await call("POST", `/api/reminders/${rem.reminder_id}/notify`, { as: "pat1", body: { channels: ["PIGEON"] } })).status, 400);

        // phone numbers are tidied; junk is rejected
        const { normalizePhone } = require("../src/services/messageSender");
        assert.equal(normalizePhone("+91 98765-43210"), "+919876543210");
        assert.equal(normalizePhone("0091 98765 43210"), "+919876543210");
        assert.throws(() => normalizePhone("12345"));
        assert.throws(() => normalizePhone("arjun@x.com"));
    } finally {
        for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        smtp.server.close(); sms.server.close();
        await pool.query("DELETE FROM appointments");
    }
});

test("a tab's own token wins over a cookie left by another role in the same browser", async () => {
    await login("admin", "admin@medsync.dev");
    const get = (headers) => fetch(`${base}/api/admin/users?limit=1`, { headers }).then((r) => r.status);
    const cookie = `auth_token=${tokens.pat1}`; // a patient signed in earlier in another tab
    assert.equal(await get({ Authorization: `Bearer ${tokens.admin}`, Cookie: cookie }), 200, "admin tab stays admin");
    assert.equal(await get({ Cookie: cookie }), 403, "with no header the cookie still works (as the patient)");
    assert.equal(await get({ Authorization: `Bearer ${tokens.pat1}`, Cookie: `auth_token=${tokens.admin}` }), 403, "patient tab stays patient");
});

test("files on a prescription: only the author uploads; owner, doctor and pharmacy read; strangers get 404; content is checked", async () => {
    const fs = require("node:fs"), os = require("node:os");
    process.env.BLOB_LOCAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "medsync-blobs-"));
    // Set AZURE_TEST_CONNECTION_STRING (e.g. to the Azurite emulator or a test storage account) to run this same test against Azure Blob Storage.
    if (process.env.AZURE_TEST_CONNECTION_STRING) process.env.AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_TEST_CONNECTION_STRING;
    else delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const send = (url, as, { method = "POST", type, body } = {}) =>
        fetch(base + url, { method, headers: { Authorization: `Bearer ${tokens[as]}`, ...(type ? { "Content-Type": type } : {}) }, body });
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("hello medsync")]);
    const up = "/api/prescriptions/1/attachments?name=" + encodeURIComponent("../../lab report.pdf");

    assert.equal((await send(up, "pat1", { type: "application/pdf", body: pdf })).status, 403, "patients cannot upload");
    assert.equal((await send(up, "doc2", { type: "application/pdf", body: pdf })).status, 404, "another doctor cannot upload");
    assert.equal((await send(up, "doc", { type: "application/pdf", body: Buffer.from("not a pdf at all") })).status, 400, "content must match the type");
    assert.equal((await send(up, "doc", { type: "text/plain", body: "hello" })).status, 400, "only pdf/png/jpeg");
    assert.equal((await send(up, "doc", { type: "application/pdf", body: Buffer.alloc(5 * 1024 * 1024 + 4096, 1) })).status, 413, "too large");

    const ok = await send(up, "doc", { type: "application/pdf", body: pdf });
    assert.equal(ok.status, 201);
    const file = (await ok.json()).data;
    assert.equal(file.file_name, "lab report.pdf", "path parts are stripped from the name");

    for (const who of ["doc", "pat1", "staff1"]) {
        const l = await (await send("/api/prescriptions/1/attachments", who, { method: "GET" })).json();
        assert.equal(l.data.length, 1, `${who} sees the file`);
        const d = await send(`/api/attachments/${file.attachment_id}/download`, who, { method: "GET" });
        assert.equal(d.status, 200);
        assert.equal(d.headers.get("content-type"), "application/pdf");
        assert.deepEqual(Buffer.from(await d.arrayBuffer()), pdf, `${who} gets the same bytes`);
    }
    for (const who of ["pat2", "doc2"]) {
        assert.equal((await send("/api/prescriptions/1/attachments", who, { method: "GET" })).status, 404);
        assert.equal((await send(`/api/attachments/${file.attachment_id}/download`, who, { method: "GET" })).status, 404);
        assert.equal((await send(`/api/attachments/${file.attachment_id}`, who, { method: "DELETE" })).status, 404);
    }
    assert.equal((await send(`/api/attachments/${file.attachment_id}`, "pat1", { method: "DELETE" })).status, 404, "a patient cannot delete");
    assert.equal((await send(`/api/attachments/${file.attachment_id}`, "doc", { method: "DELETE" })).status, 200);
    assert.equal((await send(`/api/attachments/${file.attachment_id}/download`, "doc", { method: "GET" })).status, 404);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM prescription_attachments");
    assert.equal(n, 0);
    if (process.env.AZURE_TEST_CONNECTION_STRING) await assert.rejects(require("../src/services/blobStore").get("rx-1/missing.pdf"), "a missing blob is an error");
    else assert.deepEqual(fs.readdirSync(path.join(process.env.BLOB_LOCAL_DIR, "rx-1")), [], "the stored file is gone too");
});

test("analytics: admin only; built from the SQL views; six months are always listed", async () => {
    await login("admin", "admin@medsync.dev");
    assert.equal((await call("GET", "/api/admin/analytics", { as: "doc" })).status, 403);
    const r = await call("GET", "/api/admin/analytics", { as: "admin" });
    assert.equal(r.status, 200);
    const d = r.json.data;
    assert.equal(d.prescriptions_by_month.length, 6);
    assert.ok(Array.isArray(d.adherence) && Array.isArray(d.low_stock) && d.low_stock.length > 0);
    assert.ok(d.low_stock.every((s) => typeof s.units_in_stock === "number"), "counts are numbers, not strings");
    assert.equal(d.files.storage.driver, process.env.AZURE_STORAGE_CONNECTION_STRING ? "azure-blob" : "local-folder");
    assert.ok(!JSON.stringify(d).includes("AccountKey"), "no secrets in the response");
});

test("transport hardening: security headers; with FORCE_HTTPS plain http is redirected and https gets HSTS", async () => {
    const plain = await fetch(base + "/api/health");
    assert.match(plain.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(plain.headers.get("referrer-policy"), "no-referrer");
    assert.equal(plain.headers.get("strict-transport-security"), null, "no HSTS over plain http");
    process.env.FORCE_HTTPS = "true";
    try {
        const redirected = await fetch(base + "/api/auth/me", { redirect: "manual" });
        assert.equal(redirected.status, 308);
        assert.match(redirected.headers.get("location"), /^https:\/\/[^/]+\/api\/auth\/me$/);
        assert.equal((await fetch(base + "/api/health", { redirect: "manual" })).status, 200, "health probes stay on http");
        const secure = await fetch(base + "/api/auth/me", { headers: { "X-Forwarded-Proto": "https" }, redirect: "manual" });
        assert.equal(secure.status, 401);
        assert.match(secure.headers.get("strict-transport-security"), /max-age=/);
    } finally { delete process.env.FORCE_HTTPS; }
});

test("interaction override: the reason is audited only when the server finds an interaction", async () => {
    const [[pat]] = await pool.query("SELECT p.patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'arjun.kumar@medsync.dev'");
    const rx = (medicines, extra = {}) => ({ patient_id: pat.patient_id, prescription_date: inDays(0), diagnosis: "Pain", ...extra,
        items: medicines.map((m) => ({ medicine_id: m, dosage: "1 tablet", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(2) })) });
    const overrides = async () => (await pool.query("SELECT details FROM audit_logs WHERE action = 'INTERACTION_OVERRIDE'"))[0];
    const before = (await overrides()).length;

    // medicines 1 and 3 are a seeded interaction pair
    const made = await call("POST", "/api/prescriptions", { as: "doc", body: rx([1, 3], { interaction_override_reason: "Benefit outweighs the risk; monitored." }) });
    assert.equal(made.status, 201);
    const after1 = await overrides();
    assert.equal(after1.length, before + 1, "the override was audited");
    const details = typeof after1[after1.length - 1].details === "string" ? JSON.parse(after1[after1.length - 1].details) : after1[after1.length - 1].details;
    assert.match(details.reason, /Benefit outweighs/);
    assert.ok(details.interactions.length >= 1);

    // a reason with no interaction is ignored: nothing to override (medicine 5 is in no seeded pair)
    assert.equal((await call("POST", "/api/prescriptions", { as: "doc", body: rx([5], { interaction_override_reason: "Not needed" }) })).status, 201);
    // an interaction without a reason is still allowed here (nothing is audited)
    assert.equal((await call("POST", "/api/prescriptions", { as: "doc", body: rx([1, 3]) })).status, 201);
    assert.equal((await overrides()).length, before + 1);
});

test("a SEVERE interaction is refused by the server unless a written reason is sent", async () => {
    const [[pat]] = await pool.query("SELECT p.patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'priya.sharma@medsync.dev'");
    const [made] = await pool.query("INSERT INTO medicine_interactions (medicine_id_1, medicine_id_2, severity, description) VALUES (5, 6, 'SEVERE', 'Test pair')");
    try {
        const rx = (extra = {}) => ({ patient_id: pat.patient_id, prescription_date: inDays(0), diagnosis: "Test", ...extra,
            items: [5, 6].map((m) => ({ medicine_id: m, dosage: "1 tablet", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(2) })) });
        const count = async () => (await pool.query("SELECT COUNT(*) AS n FROM prescriptions"))[0][0].n;
        const n0 = await count();

        const none = await call("POST", "/api/prescriptions", { as: "doc", body: rx() });
        assert.equal(none.status, 400);
        assert.match(none.json.message, /Severe interaction/);
        assert.equal((await call("POST", "/api/prescriptions", { as: "doc", body: rx({ interaction_override_reason: "ok" }) })).status, 400, "too short to count as a reason");
        assert.equal(await count(), n0, "refused requests save nothing");

        const ok = await call("POST", "/api/prescriptions", { as: "doc", body: rx({ interaction_override_reason: "Specialist advice; monitored closely." }) });
        assert.equal(ok.status, 201);
        assert.equal(await count(), n0 + 1);
        const [rows] = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'INTERACTION_OVERRIDE' AND entity_id = ?", [ok.json.data.prescription_id]);
        assert.equal(rows.length, 1);
    } finally {
        await pool.query("DELETE FROM medicine_interactions WHERE interaction_id = ?", [made.insertId]);
    }
});

test("pharmacy: the pharmacist sees interaction warnings and the doctor's reason, and must acknowledge a SEVERE one to dispense", async () => {
    const [[staff]] = await pool.query("SELECT ps.pharmacy_id FROM pharmacy_staff ps JOIN users u ON u.user_id = ps.user_id WHERE u.email = 'neha.patel@medsync.dev'");
    const [[pat]] = await pool.query("SELECT p.patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'priya.sharma@medsync.dev'");
    const [pair] = await pool.query("INSERT INTO medicine_interactions (medicine_id_1, medicine_id_2, severity, description) VALUES (5, 6, 'SEVERE', 'Test pair')");
    try {
        for (const m of [5, 6]) await pool.query("INSERT INTO medicine_batches (medicine_id, pharmacy_id, batch_number, quantity, expiry_date) VALUES (?, ?, ?, 100, ?)", [m, staff.pharmacy_id, `IXN-${m}`, inDays(365)]);
        const rx = { patient_id: pat.patient_id, prescription_date: inDays(0), diagnosis: "Test", interaction_override_reason: "Specialist advice; monitored closely.",
            items: [5, 6].map((m) => ({ medicine_id: m, dosage: "1 tablet", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(2) })) };
        const made = await call("POST", "/api/prescriptions", { as: "doc", body: rx });
        assert.equal(made.status, 201);
        const id = made.json.data.prescription_id;
        const url = `/api/pharmacies/${staff.pharmacy_id}/prescriptions/${id}`;

        const review = await call("GET", `${url}/stock`, { as: "staff1" });
        assert.equal(review.status, 200);
        assert.ok(review.json.data.interactions.some((x) => x.severity === "SEVERE"), "the warning is shown to the pharmacist");
        assert.equal(review.json.data.requires_interaction_acknowledgement, true);
        assert.match(review.json.data.doctor_override_reason, /Specialist advice/);

        const refused = await call("POST", `${url}/dispense`, { as: "staff1", body: {} });
        assert.equal(refused.status, 400);
        assert.match(refused.json.message, /Severe interaction/);
        assert.equal((await call("POST", `${url}/dispense`, { as: "staff1", body: { acknowledge_interactions: "yes" } })).status, 400, "only a real true counts");
        const [[still]] = await pool.query("SELECT status FROM prescriptions WHERE prescription_id = ?", [id]);
        assert.equal(still.status, "ACTIVE", "nothing was dispensed");

        const ok = await call("POST", `${url}/dispense`, { as: "staff1", body: { acknowledge_interactions: true } });
        assert.equal(ok.status, 200);
        const [audit] = await pool.query("SELECT details FROM audit_logs WHERE action = 'PRESCRIPTION_DISPENSE' AND entity_id = ?", [id]);
        const d = typeof audit[0].details === "string" ? JSON.parse(audit[0].details) : audit[0].details;
        assert.equal(d.interactions_acknowledged, true);
    } finally {
        await pool.query("DELETE FROM medicine_interactions WHERE interaction_id = ?", [pair.insertId]);
    }
});

test("exports: prescription PDF follows ownership, patient data is only their own, admin CSV reports, every export is audited", async () => {
    const raw = async (url, as) => {
        const res = await fetch(base + url, { headers: as && tokens[as] ? { Authorization: `Bearer ${tokens[as]}` } : {} });
        return { status: res.status, type: res.headers.get("content-type") || "", disposition: res.headers.get("content-disposition") || "", buf: Buffer.from(await res.arrayBuffer()) };
    };
    const [[pat]] = await pool.query("SELECT p.patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'arjun.kumar@medsync.dev'");
    const made = await call("POST", "/api/prescriptions", { as: "doc", body: { patient_id: pat.patient_id, prescription_date: inDays(0), diagnosis: '=HYPERLINK("http://example.com")',
        items: [{ medicine_id: 5, dosage: "1 tablet (10 mg)", frequency_per_day: 1, start_date: inDays(0), end_date: inDays(2) }] } });
    assert.equal(made.status, 201);
    const id = made.json.data.prescription_id;
    const count = async (action) => (await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?", [action]))[0][0].n;

    // ---- prescription PDF
    const exportsBefore = await count("PRESCRIPTION_EXPORT");
    for (const who of ["doc", "pat1", "staff1"]) {
        const r = await raw(`/api/export/prescriptions/${id}`, who);
        assert.equal(r.status, 200, `${who} may download it`);
        assert.match(r.type, /^application\/pdf/);
        assert.match(r.disposition, /attachment; filename="medsync-prescription-\d+\.pdf"/);
        assert.equal(r.buf.subarray(0, 5).toString(), "%PDF-");
        assert.match(r.buf.subarray(-6).toString(), /%%EOF/);
    }
    assert.equal((await count("PRESCRIPTION_EXPORT")) - exportsBefore, 3, "each download is audited");
    assert.equal((await raw(`/api/export/prescriptions/${id}`, "pat2")).status, 404, "another patient");
    assert.equal((await raw(`/api/export/prescriptions/${id}`, "doc2")).status, 404, "another doctor");
    assert.equal((await raw(`/api/export/prescriptions/${id}`)).status, 401);
    assert.equal((await raw("/api/export/prescriptions/999999", "doc")).status, 404);

    // ---- a patient's own data
    const json = await raw("/api/export/my-data?format=json", "pat1");
    assert.equal(json.status, 200);
    assert.match(json.disposition, /attachment/);
    const mine = JSON.parse(json.buf.toString("utf8"));
    assert.equal(mine.profile.email, "arjun.kumar@medsync.dev");
    assert.equal(mine.prescriptions.find((p) => p.prescription_id === id).items.length, 1);
    assert.ok(!json.buf.toString("utf8").includes("priya.sharma@medsync.dev"), "nothing of another patient");
    assert.ok(!json.buf.toString("utf8").includes("password"), "no password data");

    const csv = await raw("/api/export/my-data?format=csv&part=prescriptions", "pat1");
    assert.equal(csv.status, 200);
    assert.match(csv.type, /^text\/csv/);
    const text = csv.buf.toString("utf8");
    assert.ok(text.startsWith("﻿Prescription,Date,Status,Doctor,Diagnosis"), "header row with a byte-order mark");
    assert.ok(text.includes(`"'=HYPERLINK(""http://example.com"")"`) || text.includes("'=HYPERLINK"), "a formula in a text field is neutralised");
    assert.ok(!/(^|,)=HYPERLINK/m.test(text), "no cell starts with =");
    assert.equal((await raw("/api/export/my-data?format=csv&part=reminders", "pat1")).status, 200);
    assert.equal((await raw("/api/export/my-data?format=xml", "pat1")).status, 400);
    assert.equal((await raw("/api/export/my-data", "doc")).status, 403, "only patients have patient data");
    assert.equal((await raw("/api/export/my-data")).status, 401);
    assert.ok((await count("PATIENT_DATA_EXPORT")) >= 3);

    // ---- administrator reports
    await login("admin", "admin@medsync.dev");
    const users = await raw("/api/export/admin/users", "admin");
    assert.equal(users.status, 200);
    assert.match(users.type, /^text\/csv/);
    const usersText = users.buf.toString("utf8");
    assert.ok(usersText.includes("ananya.rao@medsync.dev"));
    assert.ok(!/password|\$2[aby]\$/i.test(usersText), "no password data");
    assert.equal((await raw("/api/export/admin/stock", "admin")).status, 200);
    const audit = await raw(`/api/export/admin/audit?from=2000-01-01&to=${inDays(1)}`, "admin");
    assert.equal(audit.status, 200);
    const auditText = audit.buf.toString("utf8");
    assert.ok(auditText.includes("PRESCRIPTION_EXPORT"));
    assert.ok(!/details/i.test(auditText.split("\r\n")[0]), "free-text details are not exported");
    assert.equal((await raw(`/api/export/admin/audit?from=${inDays(1)}&to=2000-01-01`, "admin")).status, 400, "from after to");
    assert.equal((await raw("/api/export/admin/audit?from=yesterday", "admin")).status, 400);
    assert.equal((await raw("/api/export/admin/passwords", "admin")).status, 400, "unknown report");
    for (const who of ["doc", "pat1", "staff1"]) assert.equal((await raw("/api/export/admin/users", who)).status, 403, `${who} is not an admin`);
    assert.equal((await raw("/api/export/admin/users")).status, 401);
    assert.ok((await count("ADMIN_EXPORT")) >= 3, "report downloads are audited");
});

test("csv writer: quotes, line ends and spreadsheet formulas", () => {
    const { toCsv, cell } = require("../src/utils/csv");
    assert.equal(cell('say "hi", ok'), '"say ""hi"", ok"');
    assert.equal(cell("line1\nline2"), '"line1\nline2"');
    for (const bad of ["=1+1", "+1", "-1+2", "@SUM(A1)", "\t=x"]) assert.ok(cell(bad).startsWith("'"), `${JSON.stringify(bad)} is neutralised`);
    assert.equal(cell(-5), "-5", "real numbers stay numbers");
    assert.equal(cell(null), "");
    assert.equal(toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: 1, b: "x,y" }]), '﻿A,B\r\n1,"x,y"\r\n');
});

test("prescription templates: a doctor saves, lists and deletes their own; others cannot see them", async () => {
    const good = { name: "Fever (adult)", diagnosis: "Fever", notes: "Rest and fluids", items: [
        { medicine_id: 1, dosage: "500 mg", frequency_per_day: 3, duration_days: 5 },
        { medicine_id: 3, dosage: "400 mg", frequency_per_day: 1, duration_days: 3, instructions: "After food" }
    ] };
    const made = await call("POST", "/api/templates", { as: "doc", body: good });
    assert.equal(made.status, 201);

    const mine = await call("GET", "/api/templates", { as: "doc" });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.data.length, 1);
    assert.equal(mine.json.data[0].name, "Fever (adult)");
    assert.equal(mine.json.data[0].items.length, 2);
    assert.equal(mine.json.data[0].items[0].duration_days, 5);
    assert.ok(mine.json.data[0].items[0].medicine_name, "the medicine name is included for the screen");

    assert.equal((await call("POST", "/api/templates", { as: "doc", body: good })).status, 409, "same name twice");
    assert.equal((await call("POST", "/api/templates", { as: "doc", body: { ...good, name: "Bad medicine", items: [{ ...good.items[0], medicine_id: 999 }] } })).status, 400);
    assert.equal((await call("POST", "/api/templates", { as: "doc", body: { ...good, name: "Too long", items: [{ ...good.items[0], duration_days: 400 }] } })).status, 400);
    assert.equal((await call("POST", "/api/templates", { as: "doc", body: { ...good, name: "Empty", items: [] } })).status, 400);
    assert.equal((await call("GET", "/api/templates", { as: "doc" })).json.data.length, 1, "failed saves leave nothing behind");

    const id = made.json.data.template_id;
    assert.deepEqual((await call("GET", "/api/templates", { as: "doc2" })).json.data, [], "another doctor sees none");
    assert.equal((await call("DELETE", `/api/templates/${id}`, { as: "doc2" })).status, 404, "another doctor cannot delete it");
    assert.equal((await call("GET", "/api/templates", { as: "pat1" })).status, 403, "patients have no templates");
    assert.equal((await call("GET", "/api/templates")).status, 401);

    assert.equal((await call("DELETE", `/api/templates/${id}`, { as: "doc" })).status, 200);
    assert.equal((await call("GET", "/api/templates", { as: "doc" })).json.data.length, 0);
    const [[left]] = await pool.query("SELECT COUNT(*) AS n FROM prescription_template_items WHERE template_id = ?", [id]);
    assert.equal(left.n, 0, "the items were deleted with the template");
});

// ---------------------------------------------------------------------------------------------
// Email verification. No real email is sent: messageSender.sendVerificationEmail is replaced in before().
// ---------------------------------------------------------------------------------------------
const mailReg = (email, extra = {}) => call("POST", "/api/auth/register", { body: { name: "Mail Tester", email, password: "Strong@123", date_of_birth: "2000-01-15", ...extra } });
const tokenFor = (email) => [...outbox].reverse().find((m) => m.to === email)?.token;
const verifyCall = (token) => call("POST", "/api/auth/verify-email", { body: { token } });
const verifiedAt = async (email) => (await pool.query("SELECT email_verified_at FROM users WHERE email = ?", [email]))[0][0].email_verified_at;

test("email verification: new registration is pending, stores only a hashed 24-hour token, and mails the raw token once", async () => {
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    outbox.length = 0;
    const r = await mailReg("ev1@medsync.dev");
    assert.equal(r.status, 201);
    assert.equal(r.json.data.user.email_verified, false);
    assert.ok(!JSON.stringify(r.json).includes(tokenFor("ev1@medsync.dev")), "the token is never in the API response");
    assert.equal(await verifiedAt("ev1@medsync.dev"), null);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].name, "Mail Tester");
    const raw = outbox[0].token;
    assert.match(raw, /^[0-9a-f]{64}$/);
    const [rows] = await pool.query("SELECT token_hash, used_at, TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS mins FROM email_verifications v JOIN users u ON u.user_id = v.user_id WHERE u.email = 'ev1@medsync.dev'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_hash, require("node:crypto").createHash("sha256").update(raw).digest("hex"), "the SHA-256 of the token is stored");
    assert.notEqual(rows[0].token_hash, raw);
    assert.equal(rows[0].used_at, null);
    assert.ok(rows[0].mins > 23 * 60 && rows[0].mins <= 24 * 60, "valid for 24 hours");
    const [[plain]] = await pool.query("SELECT COUNT(*) AS n FROM email_verifications WHERE token_hash = ?", [raw]);
    assert.equal(plain.n, 0, "the raw token is not stored");
});

test("email verification: the email is built with the link, HTML and plain text, and sent through SMTP settings from the environment (mocked)", async () => {
    const nodemailer = require("nodemailer");
    const realCreate = nodemailer.createTransport;
    const saved = {};
    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_NAME", "SMTP_FROM_EMAIL", "FRONTEND_URL", "MAIL_FROM"];
    for (const k of keys) saved[k] = process.env[k];
    Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "sender@example.test", SMTP_PASS: "unit-test-pass-123", SMTP_FROM_NAME: "MedSync Team", SMTP_FROM_EMAIL: "sender@example.test", FRONTEND_URL: "https://app.example.test/" });
    delete process.env.MAIL_FROM;
    const sentMail = []; let options;
    nodemailer.createTransport = (o) => { options = o; return { sendMail: async (m) => { sentMail.push(m); }, verify: async () => true }; };
    try {
        await realSendVerification("patient@example.test", "abc123token", "Asha <b>");
        assert.equal(sentMail.length, 1);
        const m = sentMail[0];
        assert.equal(m.to, "patient@example.test");
        assert.deepEqual(m.from, { name: "MedSync Team", address: "sender@example.test" });
        assert.match(m.subject, /verify/i);
        for (const body of [m.html, m.text]) assert.ok(body.includes("https://app.example.test/verify-email?token=abc123token"), "has the link");
        assert.ok(m.html.includes("Verify Email") && m.html.includes("24 hours") && m.html.includes("viewport"), "branded, responsive HTML");
        assert.ok(!m.html.includes("Asha <b>") && m.html.includes("Asha &lt;b&gt;"), "the name is escaped");
        assert.match(m.text, /24 hours/);
        assert.match(m.text, /did not (create|register)|didn't (create|register)|ignore/i);
        assert.equal(options.host, "smtp.example.test");
        assert.equal(options.requireTLS, true, "port 587 must use STARTTLS");
        assert.deepEqual(options.auth, { user: "sender@example.test", pass: "unit-test-pass-123" });
    } finally {
        nodemailer.createTransport = realCreate;
        for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
});

test("email verification: a valid token verifies once; the same link again says 'already used'", async () => {
    outbox.length = 0;
    assert.equal((await mailReg("ev2@medsync.dev")).status, 201);
    const token = tokenFor("ev2@medsync.dev");
    const ok = await verifyCall(token);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.verified, true);
    assert.ok(await verifiedAt("ev2@medsync.dev"), "email_verified_at is set");
    const [[row]] = await pool.query("SELECT used_at FROM email_verifications WHERE token_hash = SHA2(?, 256)", [token]);
    assert.ok(row.used_at, "the token is consumed");
    const [[audit]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'EMAIL_VERIFIED'");
    assert.ok(audit.n >= 1);
    assert.equal((await verifyCall(token)).status, 409, "reused token");
});

test("email verification: invalid, malformed and missing tokens are rejected; GET never verifies", async () => {
    assert.equal((await verifyCall(require("node:crypto").randomBytes(32).toString("hex"))).status, 400, "unknown token");
    assert.equal((await verifyCall("short")).status, 400);
    assert.equal((await verifyCall(undefined)).status, 400);
    assert.equal((await verifyCall({ $ne: 1 })).status, 400, "not a string");
    outbox.length = 0;
    await mailReg("ev3@medsync.dev");
    const token = tokenFor("ev3@medsync.dev");
    const viaGet = await call("GET", `/api/auth/verify-email?token=${token}`);
    assert.notEqual(viaGet.status, 200, "a link opened by a mail scanner must not verify");
    assert.equal(await verifiedAt("ev3@medsync.dev"), null);
    assert.equal((await call("POST", `/api/auth/verify-email?token=${token}`)).status, 400, "the token must be in the body, not the URL");
    assert.equal(await verifiedAt("ev3@medsync.dev"), null);
});

test("email verification: an expired token is refused (410) and does not verify", async () => {
    outbox.length = 0;
    await mailReg("ev4@medsync.dev");
    const token = tokenFor("ev4@medsync.dev");
    await pool.query("UPDATE email_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE token_hash = SHA2(?, 256)", [token]);
    assert.equal((await verifyCall(token)).status, 410);
    assert.equal(await verifiedAt("ev4@medsync.dev"), null);
    const [[row]] = await pool.query("SELECT used_at FROM email_verifications WHERE token_hash = SHA2(?, 256)", [token]);
    assert.equal(row.used_at, null);
});

test("email verification: an unverified patient cannot sign in; after verifying they can; the lock is not a password-guess lockout", async () => {
    await throttle.resetAllThrottles();
    outbox.length = 0;
    await mailReg("ev5@medsync.dev");
    for (let i = 0; i < 6; i++) {
        const r = await call("POST", "/api/auth/login", { body: { email: "ev5@medsync.dev", password: "Strong@123" } });
        assert.equal(r.status, 403, "blocked with a clear message, never throttled to 429");
        assert.match(r.json.message, /verify your email/i);
    }
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "ev5@medsync.dev", password: "Wrong@1234" } })).status, 401, "a wrong password does not reveal the account state");
    assert.equal((await verifyCall(tokenFor("ev5@medsync.dev"))).status, 200);
    const ok = await call("POST", "/api/auth/login", { body: { email: "ev5@medsync.dev", password: "Strong@123" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.user.role, "PATIENT");
    await throttle.resetAllThrottles();
});

test("email verification: existing verified patients, doctors, pharmacy staff and admins sign in as before", async () => {
    await throttle.resetAllThrottles();
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE email = 'arjun.kumar@medsync.dev' AND email_verified_at IS NOT NULL");
    assert.equal(n, 1, "the migration verified existing accounts");
    for (const email of ["arjun.kumar@medsync.dev", "ananya.rao@medsync.dev", "neha.patel@medsync.dev", "admin@medsync.dev"]) {
        assert.equal((await call("POST", "/api/auth/login", { body: { email, password: PASSWORD } })).status, 200, email);
    }
    // Staff accounts are made by an administrator and are never held back, even without a verified date.
    await pool.query("UPDATE users SET email_verified_at = NULL WHERE email IN ('ananya.rao@medsync.dev','neha.patel@medsync.dev','admin@medsync.dev')");
    try {
        for (const email of ["ananya.rao@medsync.dev", "neha.patel@medsync.dev", "admin@medsync.dev"]) {
            assert.equal((await call("POST", "/api/auth/login", { body: { email, password: PASSWORD } })).status, 200, `${email} (no verified date)`);
        }
    } finally {
        await pool.query("UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL AND email IN ('ananya.rao@medsync.dev','neha.patel@medsync.dev','admin@medsync.dev')");
    }
    await throttle.resetAllThrottles();
});

test("email verification: resend replaces the old link, waits between sends, and never reveals whether an account exists", async () => {
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    outbox.length = 0;
    await mailReg("ev6@medsync.dev");
    const first = tokenFor("ev6@medsync.dev");
    const resend = (email) => call("POST", "/api/auth/resend-verification", { body: { email } });

    const tooSoon = await resend("ev6@medsync.dev");
    assert.equal(tooSoon.status, 200);
    assert.equal(outbox.filter((m) => m.to === "ev6@medsync.dev").length, 1, "no second email inside the cooldown");

    await pool.query("UPDATE email_verifications SET created_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
    const again = await resend("EV6@medsync.dev");
    assert.equal(again.status, 200);
    const second = tokenFor("ev6@medsync.dev");
    assert.notEqual(second, first);
    assert.equal(outbox.filter((m) => m.to === "ev6@medsync.dev").length, 2);
    assert.equal((await verifyCall(first)).status, 400, "the older link no longer works");
    const [[{ active }]] = await pool.query("SELECT COUNT(*) AS active FROM email_verifications v JOIN users u ON u.user_id = v.user_id WHERE u.email = 'ev6@medsync.dev' AND v.used_at IS NULL");
    assert.equal(active, 1, "only one active token");

    const before = outbox.length;
    const unknown = await resend("nobody-here@medsync.dev");
    const verifiedPatient = await resend("arjun.kumar@medsync.dev");
    const doctor = await resend("ananya.rao@medsync.dev");
    for (const x of [unknown, verifiedPatient, doctor]) { assert.equal(x.status, 200); assert.deepEqual(x.json, again.json, "same answer for every address"); }
    assert.equal(outbox.length, before, "nothing was sent for unknown, verified or staff addresses");
    assert.equal((await resend("not-an-email")).status, 400);

    assert.equal((await verifyCall(second)).status, 200);
    assert.equal((await resend("ev6@medsync.dev")).status, 200);
    assert.equal(outbox.length, before, "nothing is sent once verified");
});

test("email verification: resend and registration are rate limited", async () => {
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    const resend = () => call("POST", "/api/auth/resend-verification", { body: { email: "limit@medsync.dev" } });
    for (let i = 0; i < 5; i++) assert.equal((await resend()).status, 200);
    assert.equal((await resend()).status, 429);
    assert.equal((await call("POST", "/api/auth/resend-verification", { body: { email: "other@medsync.dev" } })).status, 200, "another address is counted separately");
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    let last;
    for (let i = 0; i < 21; i++) last = await call("POST", "/api/auth/register", { body: { name: "x", email: "bad" } }); // invalid on purpose: fast
    assert.equal(last.status, 429);
    await require("../src/middleware/rateLimit").resetAllRateLimits();
});

test("email verification: duplicate registration is refused and leaves one account", async () => {
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    assert.equal((await mailReg("ev7@medsync.dev")).status, 201);
    assert.equal((await mailReg("ev7@medsync.dev")).status, 400);
    assert.equal((await mailReg("EV7@Medsync.dev")).status, 400, "upper case is the same address");
    assert.equal((await mailReg("arjun.kumar@medsync.dev")).status, 400, "an existing account");
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE email = 'ev7@medsync.dev'");
    assert.equal(n, 1);
    const [[{ t }]] = await pool.query("SELECT COUNT(*) AS t FROM email_verifications v JOIN users u ON u.user_id = v.user_id WHERE u.email = 'ev7@medsync.dev'");
    assert.equal(t, 1, "one token, not one per attempt");
});

test("email verification: when email cannot be sent the account is still created, and the SMTP check never shows the password", async () => {
    const nodemailer = require("nodemailer");
    const realCreate = nodemailer.createTransport;
    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"];
    const saved = {};
    for (const k of keys) saved[k] = process.env[k];
    const warn = console.warn; const warned = [];
    try {
        await require("../src/middleware/rateLimit").resetAllRateLimits();
        // 1. nothing configured: the real sender refuses, registration still succeeds and says the email was not sent
        for (const k of keys) delete process.env[k];
        sender.sendVerificationEmail = realSendVerification;
        console.warn = (...a) => warned.push(a.join(" "));
        const r = await mailReg("ev8@medsync.dev");
        assert.equal(r.status, 201);
        assert.equal(r.json.data.user.verification_email_sent, false);
        assert.equal(await verifiedAt("ev8@medsync.dev"), null);
        assert.ok(!warned.join(" ").match(/[0-9a-f]{64}/), "no token in the logs");
        const [[tok]] = await pool.query("SELECT COUNT(*) AS n FROM email_verifications v JOIN users u ON u.user_id = v.user_id WHERE u.email = 'ev8@medsync.dev'");
        assert.equal(tok.n, 1, "a token exists, so a later resend can work");
        assert.deepEqual((await sender.verifySmtp()).configured, false);
        assert.equal((await sender.verifySmtp()).ok, false);

        // 2. configured but the server rejects the login: the problem is reported without the password
        Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "sender@example.test", SMTP_PASS: "super-secret-app-pass" });
        nodemailer.createTransport = () => ({ verify: async () => { throw new Error("Invalid login: 535 for super-secret-app-pass"); }, sendMail: async () => { throw new Error("nope"); } });
        const check = await sender.verifySmtp();
        assert.equal(check.ok, false);
        assert.equal(check.sign_in_set, true);
        assert.ok(!JSON.stringify(check).includes("super-secret-app-pass"), "the password is never in the result");
        const failed = await mailReg("ev9@medsync.dev");
        assert.equal(failed.status, 201, "a mail server problem never blocks sign-up");
        assert.equal(failed.json.data.user.verification_email_sent, false);
        assert.ok(!warned.join(" ").includes("super-secret-app-pass"), "the password is never logged");

        // 3. half configured
        delete process.env.SMTP_PASS;
        const half = await sender.verifySmtp();
        assert.equal(half.ok, false);
        assert.match(half.problem, /SMTP_USER and SMTP_PASS/);
    } finally {
        console.warn = warn;
        nodemailer.createTransport = realCreate;
        sender.sendVerificationEmail = async (to, token, name) => { outbox.push({ to, token, name }); };
        for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        await require("../src/middleware/rateLimit").resetAllRateLimits();
    }
});

test("admin delete: needs the typed email; removes a doctor, a patient and pharmacy staff with their records; keeps the audit trail", async () => {
    await require("../src/middleware/rateLimit").resetAllRateLimits();
    await throttle.resetAllThrottles();
    const del = (id, body, as = "admin") => call("DELETE", `/api/admin/users/${id}`, { as, body });
    const count = async (sql, p = []) => (await pool.query(sql, p))[0][0].n;
    const idOf = async (email) => ((await pool.query("SELECT user_id FROM users WHERE email = ?", [email]))[0][0] || {}).user_id;

    // A doctor, a patient (verified), and a staff member, all new
    const made = await call("POST", "/api/admin/users", { as: "admin", body: { role: "DOCTOR", name: "Dr Remove", email: "dr.remove@medsync.dev", password: "Strong@123", license_number: "LIC-DEL-1", specialization: "General" } });
    assert.equal(made.status, 201);
    assert.equal((await call("POST", "/api/admin/users", { as: "admin", body: { role: "PHARMACY_STAFF", name: "Staff Remove", email: "staff.remove@medsync.dev", password: "Strong@123", pharmacy_id: 1 } })).status, 201);
    assert.equal((await mailReg("pat.remove@medsync.dev")).status, 201);
    await pool.query("UPDATE users SET email_verified_at = NOW() WHERE email = 'pat.remove@medsync.dev'");
    const docLogin = await call("POST", "/api/auth/login", { body: { email: "dr.remove@medsync.dev", password: "Strong@123" } });
    tokens.deldoc = docLogin.json.data.token;
    const [[{ patient_id: patientId }]] = await pool.query("SELECT patient_id FROM patients p JOIN users u ON u.user_id = p.user_id WHERE u.email = 'pat.remove@medsync.dev'");
    const [[{ doctor_id: doctorId }]] = await pool.query("SELECT doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.email = 'dr.remove@medsync.dev'");
    const rx = await call("POST", "/api/prescriptions", { as: "deldoc", body: rxBody(patientId) });
    assert.equal(rx.status, 201);
    const rxId2 = rx.json.data.prescription_id;
    await pool.query("INSERT INTO appointments (patient_id, doctor_id, scheduled_at, reason) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY), 'Check')", [patientId, doctorId]);
    await pool.query("INSERT INTO prescription_templates (doctor_id, name) VALUES (?, 'mine')", [doctorId]);

    // guards
    const docId = await idOf("dr.remove@medsync.dev");
    assert.equal((await del(docId, { confirm_email: "dr.remove@medsync.dev" }, "doc")).status, 403, "only admins");
    assert.equal((await del(docId, {})).status, 400, "no confirmation");
    assert.equal((await del(docId, { confirm_email: "someone@else.dev" })).status, 400, "wrong confirmation");
    assert.equal((await del(999999, { confirm_email: "x@y.dev" })).status, 404);
    const adminId = await idOf("admin@medsync.dev");
    assert.equal((await del(adminId, { confirm_email: "admin@medsync.dev" })).status, 403, "not your own account");
    assert.equal(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'dr.remove@medsync.dev'"), 1, "nothing was deleted by the refused calls");

    // doctor: their prescription (and its reminders) go; the patient stays
    const gone = await del(docId, { confirm_email: " DR.Remove@medsync.dev " });
    assert.equal(gone.status, 200);
    assert.equal(gone.json.data.prescriptions_removed, 1);
    assert.equal(await count("SELECT COUNT(*) AS n FROM prescriptions WHERE prescription_id = ?", [rxId2]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM prescription_items WHERE prescription_id = ?", [rxId2]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM doctors WHERE doctor_id = ?", [doctorId]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM prescription_templates WHERE doctor_id = ?", [doctorId]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM patients WHERE patient_id = ?", [patientId]), 1, "their patient is untouched");
    assert.equal((await call("GET", "/api/doctors/me", { as: "deldoc" })).status, 401, "their session ends");
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "dr.remove@medsync.dev", password: "Strong@123" } })).status, 401);

    // patient: gone with appointments; other patients keep their data
    const before = await count("SELECT COUNT(*) AS n FROM prescriptions");
    const patId = await idOf("pat.remove@medsync.dev");
    assert.equal((await del(patId, { confirm_email: "pat.remove@medsync.dev" })).status, 200);
    assert.equal(await count("SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ?", [patientId]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM email_verifications WHERE user_id = ?", [patId]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM prescriptions"), before, "other prescriptions are untouched");
    assert.equal(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'arjun.kumar@medsync.dev'"), 1);

    // pharmacy staff
    const stId = await idOf("staff.remove@medsync.dev");
    assert.equal((await del(stId, { confirm_email: "staff.remove@medsync.dev" })).status, 200);
    assert.equal(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'staff.remove@medsync.dev'"), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM pharmacy_staff WHERE user_id = ?", [stId]), 0);

    // the audit trail records who deleted whom
    const [logs] = await pool.query("SELECT user_id, entity_id, details FROM audit_logs WHERE action = 'USER_DELETE' ORDER BY audit_id");
    assert.equal(logs.length, 3);
    assert.ok(logs.every((l) => l.user_id === adminId));
    assert.ok(logs.some((l) => /dr\.remove@medsync\.dev/.test(l.details)));
});
