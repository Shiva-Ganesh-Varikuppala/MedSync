// Learns a new adherence-risk model from the reminder history and prints how it did on the held-out test weeks.
//   node --env-file=.env.local scripts/trainRiskModel.js        (or: npm run ml:train)
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/config/database");
const risk = require("../src/services/riskService");

risk.trainModel(null)
    .then((r) => {
        if (!r.trained) { console.log(`Not trained: ${r.reason}`); return; }
        const m = r.metrics;
        console.log(`Saved model #${r.model_id}.`);
        console.log(`Trained on ${m.n_train} examples, tested on ${m.n_test} later ones (split at ${m.split_date}).`);
        console.log(`AUC ${m.auc}  (the one-line rule "last week's adherence" scores ${m.baseline_auc})`);
        console.log(`At a 0.5 cut-off: accuracy ${m.accuracy}, precision ${m.precision}, recall ${m.recall}`);
    })
    .catch((e) => { console.error(`Failed: ${e.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
