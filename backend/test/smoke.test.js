const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const pool = require("../src/config/database");

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
});

test("health endpoint reports database connectivity", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
});

test("protected APIs reject unauthenticated requests", async () => {
    for (const path of ["/api/medicines", "/api/reminders", "/api/patients/me/reminders", "/api/pharmacies"]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 401, path);
    }
});
