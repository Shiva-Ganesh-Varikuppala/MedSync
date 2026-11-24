// Made-up (synthetic) patients for demos and tests. NOT real data.
//
// Each patient gets a few hidden habits: how reliable they are in general, whether evenings are harder, whether
// they get better or worse over time, and a small penalty for every extra medicine. The dose history is then drawn at random
// from those habits. A model trained on this data therefore learns the habits we put in; it shows that the pipeline works,
// not how well it would do on real patients. Say so whenever the results are shown.

const { SLOT_HOURS } = require("../utils/schedule");

const HOUR = 3600e3, DAY = 24 * HOUR, GRACE = 2 * HOUR;

// A seeded random number generator, so the same seed always makes the same patients.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = (rng) => Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// endMs = "now" (naive clock ms). Doses are made for the `days` before it, only those at least 2 hours old.
function generatePatient(rng, { days = 75, endMs }) {
    const ageYears = 18 + Math.floor(rng() * 62);
    const itemCount = 1 + Math.floor(rng() * 3);
    const freqs = Array.from({ length: itemCount }, () => [1, 2, 2, 3, 4][Math.floor(rng() * 5)]);
    const base = clamp(0.84 + 0.13 * gauss(rng), 0.3, 0.98);
    const eveningPenalty = rng() < 0.35 ? 0.1 + 0.25 * rng() : 0.02;
    const medsPenalty = 0.03 * (itemCount - 1);
    const kind = rng();
    const driftEnd = kind < 0.3 ? -(0.15 + 0.35 * rng()) : kind < 0.4 ? 0.15 + 0.15 * rng() : 0;
    const driftStart = Math.floor(days * (0.3 + 0.5 * rng()));

    const startDay = Math.floor((endMs - days * DAY) / DAY) * DAY;
    const doses = [];
    freqs.forEach((freq, item) => {
        for (let day = 0; day < days + 1; day++) {
            for (const h of SLOT_HOURS[freq]) {
                const t = startDay + day * DAY + h * HOUR;
                if (t > endMs - GRACE) continue;
                const drift = day >= driftStart ? (driftEnd * (day - driftStart)) / Math.max(1, days - driftStart) : 0;
                const p = clamp(base - (h >= 17 ? eveningPenalty : 0) - medsPenalty + drift + 0.06 * gauss(rng), 0.02, 0.99);
                const u = rng();
                if (u < p) {
                    const delay = rng() < (1 - p) * 0.6 ? 2.2 * HOUR + rng() * 3 * HOUR : rng() * 40 * 60e3;
                    doses.push({ t, status: "TAKEN", answered: t + delay, item });
                } else if (rng() < 0.3) {
                    doses.push({ t, status: "SKIPPED", answered: t + (10 + rng() * 80) * 60e3, item });
                } else {
                    doses.push({ t, status: "MISSED", answered: t + GRACE, item });
                }
            }
        }
    });
    doses.sort((a, b) => a.t - b.t || a.item - b.item);
    return { ageYears, freqs, doses };
}

module.exports = { mulberry32, generatePatient };
