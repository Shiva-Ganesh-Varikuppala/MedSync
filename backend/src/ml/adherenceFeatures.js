// Turns a patient's reminder history into numbers a model can learn from, builds training examples,
// and scores a patient today. Pure functions only (no database), so it is testable on its own.
//
// The question the model answers: "Will this patient take fewer than 70% of their doses over the next 7 days?"
// It looks only at what was known up to the moment of asking (the previous 3, 7 and 30 days).
//
// A dose is { t, status, answered, item }:  t = scheduled time (ms, naive clock time), status = TAKEN | SKIPPED | MISSED | PENDING,
// answered = when the patient answered (ms) or null, item = the prescription item id.

const logistic = require("./logistic");

const HOUR = 3600e3, DAY = 24 * HOUR;
const GRACE = 2 * HOUR;                         // a dose is only counted once the 2 hour grace period has passed (same rule as the MISSED job)
const ANSWERED = new Set(["TAKEN", "SKIPPED", "MISSED"]);

const HORIZON_DAYS = 7, POOR_BELOW = 0.7;       // the prediction target
const MIN_PAST_DOSES = 6;                       // fewer answered doses in the last 30 days: "not enough history"
const MIN_SAMPLES = 200;                        // fewer training examples than this: do not train
const LEVELS = { HIGH: 0.6, MEDIUM: 0.35 };     // risk score cut-offs for the three levels

// Naive clock time: the database sends "2026-11-22 08:00:00" and we never convert time zones, so nothing shifts.
function parseTs(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
}
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// The inputs, in a fixed order. `reason(v)` explains a worrying value of that input in plain words.
const pct = (v) => `${Math.round(v * 100)}%`;
const FEATURES = [
    { name: "adh7", reason: (v) => `Took only ${pct(v)} of doses in the last 7 days` },
    { name: "adh30", reason: (v) => `Took only ${pct(v)} of doses in the last 30 days` },
    { name: "adh3", reason: (v) => `Took only ${pct(v)} of doses in the last 3 days` },
    { name: "eveningMiss30", reason: (v) => `Misses ${pct(v)} of evening doses` },
    { name: "morningMiss30", reason: (v) => `Misses ${pct(v)} of morning doses` },
    { name: "lateRate30", reason: (v) => `Takes ${pct(v)} of doses more than 2 hours late` },
    { name: "skip30", reason: (v) => `Skips ${pct(v)} of doses on purpose` },
    { name: "streak", reason: (v) => `Only ${Math.round(v)} dose${Math.round(v) === 1 ? "" : "s"} taken in a row recently` },
    { name: "meds", reason: (v) => `Takes ${Math.round(v)} different medicines` },
    { name: "perDay", reason: (v) => `${(Math.round(v * 10) / 10)} doses a day to remember` },
    { name: "age", reason: (v) => `Age ${Math.round(v)}` }
];
const NAMES = FEATURES.map((f) => f.name);

// Prior used until a model has been trained on real data. Hand-set (clinical common sense), clearly labelled "starter" in the UI.
const STARTER = {
    names: NAMES,
    mean: [0.8, 0.8, 0.8, 0.2, 0.1, 0.15, 0.05, 5, 2, 3, 40],
    std: [0.2, 0.15, 0.25, 0.2, 0.15, 0.15, 0.1, 4, 1.5, 1.5, 20],
    weights: [-1.0, -0.6, -0.3, 0.5, 0.3, 0.3, 0.3, -0.3, 0.25, 0.2, 0],
    bias: -0.8
};

const share = (list, test) => (list.length ? list.filter(test).length / list.length : null);

// The inputs for one patient at one moment (asOf, ms). Only doses at least 2 hours old are used.
function featureVector(doses, asOf, ageYears) {
    const cutoff = asOf - GRACE;
    const answered = doses.filter((d) => d.t <= cutoff && ANSWERED.has(d.status));
    const in30 = answered.filter((d) => d.t > cutoff - 30 * DAY);
    const in7 = in30.filter((d) => d.t > cutoff - 7 * DAY);
    const taken = (d) => d.status === "TAKEN";

    const adh30 = share(in30, taken) ?? 0.8;
    const adh7 = share(in7, taken) ?? adh30;
    const adh3 = share(in7.filter((d) => d.t > cutoff - 3 * DAY), taken) ?? adh7;
    const evening = share(in30.filter((d) => new Date(d.t).getUTCHours() >= 17), (d) => !taken(d)) ?? 1 - adh30;
    const morning = share(in30.filter((d) => new Date(d.t).getUTCHours() < 12), (d) => !taken(d)) ?? 1 - adh30;
    const takenWithTime = in30.filter((d) => taken(d) && d.answered !== null);
    const late = share(takenWithTime, (d) => d.answered - d.t > GRACE) ?? 0.1;
    const skip = share(in30, (d) => d.status === "SKIPPED") ?? 0;

    let streak = 0;
    for (let i = answered.length - 1; i >= 0 && streak < 14 && taken(answered[i]); i--) streak++;

    const week = doses.filter((d) => d.t <= cutoff && d.t > cutoff - 7 * DAY);
    const meds = Math.min(8, new Set(week.map((d) => d.item)).size || 1);
    const perDay = Math.min(8, week.length / 7);

    return {
        x: [adh7, adh30, adh3, evening, morning, late, skip, streak, meds, perDay, ageYears],
        info: { answered30: in30.length, answered7: in7.length, adherence7: share(in7, taken), adherence30: share(in30, taken) }
    };
}

// Training examples: for each patient, "as of" every second day, with the label taken from the following 7 days.
function makeSamples(doses, ageYears, { step = 2, minPast = MIN_PAST_DOSES, minFuture = 3 } = {}) {
    const out = [];
    const answered = doses.filter((d) => ANSWERED.has(d.status));
    if (!answered.length) return out;
    const first = doses[0].t, last = answered[answered.length - 1].t;
    for (let asOf = first + 14 * DAY; asOf + HORIZON_DAYS * DAY <= last; asOf += step * DAY) {
        const { x, info } = featureVector(doses, asOf, ageYears);
        if (info.answered30 < minPast) continue;
        const future = answered.filter((d) => d.t > asOf && d.t <= asOf + HORIZON_DAYS * DAY);
        if (future.length < minFuture) continue;
        const adherence = future.filter((d) => d.status === "TAKEN").length / future.length;
        out.push({ x, y: adherence < POOR_BELOW ? 1 : 0, asOf });
    }
    return out;
}

// Learns from every patient's history and tests honestly: the test examples all come AFTER the training ones in time,
// with a one-week gap between them, so the model is never graded on data whose outcome it could have seen.
function trainFromPatients(patients) {
    const all = [];
    for (const p of patients) all.push(...makeSamples(p.doses, p.ageYears));
    if (all.length < MIN_SAMPLES) return { ok: false, reason: `Only ${all.length} usable examples were found; at least ${MIN_SAMPLES} are needed. Add more reminder history first.` };

    const times = all.map((s) => s.asOf).sort((a, b) => a - b);
    const cut = times[Math.floor(times.length * 0.75)];
    const train = all.filter((s) => s.asOf + HORIZON_DAYS * DAY <= cut);
    const test = all.filter((s) => s.asOf > cut);
    const count = (set, label) => set.filter((s) => s.y === label).length;
    if (count(train, 1) < 25 || count(train, 0) < 25) return { ok: false, reason: "The training period does not contain enough patients with poor AND good adherence to learn from." };
    if (count(test, 1) < 10 || count(test, 0) < 10) return { ok: false, reason: "The test period does not contain enough poor AND good adherence examples to check the model honestly." };

    const model = logistic.train(train.map((s) => s.x), train.map((s) => s.y), NAMES);
    const scores = test.map((s) => logistic.predict(model, s.x));
    const labels = test.map((s) => s.y);
    const baseline = test.map((s) => 1 - s.x[0]);   // the simple rule: "low adherence last week means low adherence next week"
    const cls = logistic.classification(scores, labels, 0.5);
    const round = (v, n = 3) => (v === null ? null : Math.round(v * 10 ** n) / 10 ** n);
    return {
        ok: true,
        model,
        metrics: {
            n_train: train.length, n_test: test.length,
            poor_rate_train: round(count(train, 1) / train.length), poor_rate_test: round(count(test, 1) / test.length),
            auc: round(logistic.auc(scores, labels)), baseline_auc: round(logistic.auc(baseline, labels)),
            accuracy: round(cls.accuracy), precision: round(cls.precision), recall: round(cls.recall),
            horizon_days: HORIZON_DAYS, poor_below: POOR_BELOW, split_date: ymd(cut)
        }
    };
}

const levelOf = (risk) => (risk >= LEVELS.HIGH ? "HIGH" : risk >= LEVELS.MEDIUM ? "MEDIUM" : "LOW");

// Today's score for one patient, with the (up to) three biggest reasons in plain words.
function scorePatient(model, doses, asOf, ageYears) {
    const { x, info } = featureVector(doses, asOf, ageYears);
    const base = { adherence7: info.adherence7 === null ? null : Math.round(info.adherence7 * 1000) / 10, adherence30: info.adherence30 === null ? null : Math.round(info.adherence30 * 1000) / 10, answered30: info.answered30 };
    if (info.answered30 < MIN_PAST_DOSES) return { risk: null, level: "UNKNOWN", reasons: [], ...base };
    const { logit, parts } = logistic.linear(model, x);
    const risk = logistic.sigmoid(logit);
    const reasons = parts
        .map((c, j) => ({ c, j }))
        .filter(({ c }) => c > 0.15)
        .sort((a, b) => b.c - a.c)
        .slice(0, 3)
        .map(({ j }) => FEATURES[j].reason(x[j]));
    return { risk: Math.round(risk * 1000) / 1000, level: levelOf(risk), reasons, ...base };
}

module.exports = { FEATURES, NAMES, STARTER, LEVELS, MIN_PAST_DOSES, MIN_SAMPLES, HORIZON_DAYS, POOR_BELOW, parseTs, featureVector, makeSamples, trainFromPatients, scorePatient, levelOf };
