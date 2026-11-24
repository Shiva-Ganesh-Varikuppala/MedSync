// Tests for the adherence-risk model. No database needed: everything here is pure code.
const test = require("node:test");
const assert = require("node:assert/strict");
const logistic = require("../src/ml/logistic");
const F = require("../src/ml/adherenceFeatures");
const { mulberry32, generatePatient } = require("../src/ml/synthetic");

const HOUR = 3600e3, DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 22, 10, 0, 0);
const dose = (daysAgo, hour, status, item = 0, lateMin = 5) => {
    const t = Math.floor(NOW / DAY) * DAY - daysAgo * DAY + hour * HOUR;
    return { t, status, item, answered: status === "TAKEN" ? t + lateMin * 60e3 : t + 2 * HOUR };
};

test("auc: perfect, reversed and tied scores", () => {
    assert.equal(logistic.auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
    assert.equal(logistic.auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0);
    assert.equal(logistic.auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]), 0.5);
    assert.equal(logistic.auc([0.1, 0.2], [1, 1]), null, "needs both classes");
});

test("logistic regression learns a simple pattern and ignores a useless column", () => {
    const rng = mulberry32(7);
    const X = [], y = [];
    for (let i = 0; i < 400; i++) { const a = rng(), noise = rng(); X.push([a, noise]); y.push(a + 0.1 * (rng() - 0.5) > 0.5 ? 1 : 0); }
    const m = logistic.train(X, y, ["signal", "noise"]);
    assert.ok(m.weights[0] > 0.8, "the informative column gets a clear positive weight");
    assert.ok(Math.abs(m.weights[1]) < m.weights[0] / 5, "the noise column stays small");
    assert.ok(logistic.predict(m, [0.9, 0.5]) > 0.75 && logistic.predict(m, [0.1, 0.5]) < 0.25);
});

test("parseTs reads database times without any time-zone shift", () => {
    assert.equal(F.parseTs("2026-11-22 08:00:00"), Date.UTC(2026, 10, 22, 8, 0, 0));
    assert.equal(F.parseTs("2026-11-22T08:30"), Date.UTC(2026, 10, 22, 8, 30, 0));
    assert.equal(F.parseTs(null), null);
});

test("features: adherence, streak, evening misses and late doses come out as expected", () => {
    const doses = [];
    for (let d = 10; d >= 1; d--) {
        doses.push(dose(d, 8, "TAKEN"));
        doses.push(dose(d, 20, d % 2 ? "MISSED" : "TAKEN", 0, 200));   // every other evening missed; the taken ones are 200 min late
    }
    doses.sort((a, b) => a.t - b.t);
    const { x, info } = F.featureVector(doses, NOW, 40);
    const at = (name) => x[F.NAMES.indexOf(name)];
    assert.equal(info.answered30, 20);
    assert.ok(Math.abs(at("adh30") - 0.75) < 1e-9);
    assert.ok(Math.abs(at("eveningMiss30") - 0.5) < 1e-9);
    assert.equal(at("morningMiss30"), 0);
    assert.ok(Math.abs(at("lateRate30") - 1 / 3) < 1e-9, "15 taken doses, the 5 taken evening ones are late");
    assert.equal(at("streak"), 0, "the most recent dose (yesterday evening) was missed");
    assert.equal(at("age"), 40);
});

test("features never look at the future", () => {
    const doses = [];
    for (let d = 20; d >= 1; d--) doses.push(dose(d, 8, "TAKEN"));
    const asOf = NOW - 10 * DAY;
    const before = F.featureVector(doses, asOf, 30).x;
    const changed = doses.map((d) => (d.t > asOf ? { ...d, status: "MISSED" } : d));
    assert.deepEqual(F.featureVector(changed, asOf, 30).x, before);
});

test("a dose still inside its 2 hour grace period is not counted", () => {
    const recent = { t: NOW - HOUR, status: "MISSED", item: 0, answered: null };
    const doses = [...Array.from({ length: 8 }, (_, i) => dose(i + 1, 8, "TAKEN")), recent];
    assert.equal(F.featureVector(doses, NOW, 30).info.answered30, 8);
});

test("scorePatient: not enough history gives no score, a reliable patient scores low, an unreliable one high", () => {
    const few = [dose(2, 8, "TAKEN"), dose(1, 8, "TAKEN")];
    const r = F.scorePatient(F.STARTER, few, NOW, 40);
    assert.equal(r.risk, null);
    assert.equal(r.level, "UNKNOWN");

    const good = [], bad = [];
    for (let d = 20; d >= 1; d--) { good.push(dose(d, 8, "TAKEN"), dose(d, 20, "TAKEN")); bad.push(dose(d, 8, d % 3 ? "MISSED" : "TAKEN"), dose(d, 20, "MISSED")); }
    const g = F.scorePatient(F.STARTER, good.sort((a, b) => a.t - b.t), NOW, 40);
    const b = F.scorePatient(F.STARTER, bad.sort((a, b2) => a.t - b2.t), NOW, 40);
    assert.equal(g.level, "LOW");
    assert.equal(b.level, "HIGH");
    assert.ok(b.risk > g.risk);
    assert.equal(g.reasons.length, 0, "nothing worrying to explain");
    assert.ok(b.reasons.length >= 1 && b.reasons.length <= 3);
    assert.ok(b.reasons.some((t) => /doses|evening|morning/.test(t)));
});

test("training: refuses to train on too little data", () => {
    const rng = mulberry32(1);
    const patients = [generatePatient(rng, { days: 30, endMs: NOW })];
    const r = F.trainFromPatients(patients);
    assert.equal(r.ok, false);
    assert.match(r.reason, /examples|poor AND good/);
});

test("training on synthetic patients: honest split, a useful score, and a comparison with the simple rule", () => {
    const rng = mulberry32(42);
    const patients = Array.from({ length: 40 }, () => generatePatient(rng, { days: 75, endMs: NOW }));
    const r = F.trainFromPatients(patients);
    assert.equal(r.ok, true, r.reason);
    const m = r.metrics;
    assert.ok(m.n_train > 300 && m.n_test > 100);
    assert.ok(m.auc > 0.8, `AUC ${m.auc}`);
    assert.ok(m.auc >= m.baseline_auc - 0.05, `model ${m.auc} is not far below the one-line rule ${m.baseline_auc}`);
    assert.ok(m.split_date < "2026-11-22");
    // Same inputs, same model: training is deterministic.
    const again = F.trainFromPatients(patients);
    assert.deepEqual(again.model.weights, r.model.weights);
    // Scores stay between 0 and 1 and levels follow the cut-offs.
    for (const p of patients.slice(0, 10)) {
        const s = F.scorePatient(r.model, p.doses, NOW, p.ageYears);
        if (s.risk !== null) { assert.ok(s.risk >= 0 && s.risk <= 1); assert.equal(s.level, F.levelOf(s.risk)); }
    }
});
