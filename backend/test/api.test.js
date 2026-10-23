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
    process.env.DB_NAME = await setupTestDb(); // before the app loads the pool
    pool = require("../src/config/database");
    await pool.query("UPDATE users SET password_hash = ? WHERE user_id > 0", [await require("bcryptjs").hash(PASSWORD, 4)]);
    throttle = require("../src/middleware/loginThrottle");
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
    throttle.resetAllThrottles();
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
    throttle.resetAllThrottles();
});

test("medicine list is paged (works on MySQL 8) and search treats % as plain text", async () => {
    const r = await call("GET", "/api/medicines?limit=3&page=2", { as: "pat1" });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.items.length, 3);
    assert.equal((await call("GET", "/api/medicines/search?q=para", { as: "doc" })).json.data[0].name, "Paracetamol");
    assert.equal((await call("GET", "/api/medicines/search?q=%25", { as: "doc" })).json.data.length, 0);
});

test("interaction check finds a pair in either order", async () => {
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=1,3", { as: "doc" })).json.data.length, 1);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=3,1", { as: "doc" })).json.data.length, 1);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=5,6", { as: "doc" })).json.data.length, 0);
    assert.equal((await call("GET", "/api/interactions/check?medicineIds=1", { as: "doc" })).status, 400);
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
