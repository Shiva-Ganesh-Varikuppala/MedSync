# Adherence risk (machine learning)

MedSync estimates, for each patient a doctor treats, **how likely they are to take fewer than 70% of their doses over the next 7 days**. The doctor sees a ranked list in **Doctor → Adherence risk**, with a plain-words reason for each score. An administrator can see how well the model tested and retrain it in **Admin → Analytics → Adherence risk model**.

It is **advisory only**. It never changes a prescription, a reminder or a patient's access. It is a ranking score, not a probability, and it does not replace clinical judgement.

## How it works

1. **Data.** Every reminder already records whether the dose was taken, skipped or missed, and when. Nothing new is collected.
2. **Inputs (11 numbers per patient, per day).** Adherence over the last 3, 7 and 30 days; the share of evening and of morning doses missed; the share of doses taken more than 2 hours late; the share skipped on purpose; the current run of doses taken in a row; the number of different medicines; doses per day; and age. Only doses at least 2 hours old are used (the same grace period as the "missed" job), so nothing from the future leaks in.
3. **Model.** Logistic regression written in plain JavaScript (`backend/src/ml/logistic.js`): standardised inputs, L2 regularisation, balanced class weights, trained by gradient descent. A linear model was chosen on purpose: each input has one weight, so the reason shown to the doctor is exactly what pushed the score up. No outside AI service is used and no patient data leaves the server.
4. **Training examples.** For each patient, "as of" every second day, the inputs come from the past and the label comes from the following 7 days (poor = under 70% taken). At least 6 answered doses in the previous 30 days are needed.
5. **Honest testing.** Examples are split by time: the oldest 75% train the model, the newest 25% test it, with a one-week gap so that no test outcome could have been seen in training. Training is refused (and nothing is saved) when there are fewer than 200 examples or too few poor or good examples to test properly.
6. **Reasons.** For each patient, the three inputs that raise the score most are turned into sentences ("Misses 62% of evening doses").
7. **Levels.** Score 0.60 or more is High, 0.35 or more is Medium, below that is Low. Patients with too little history are shown as "Not enough data" instead of getting a made-up score.
8. **Starter model.** Until a model is trained, hand-set weights (`STARTER` in `adherenceFeatures.js`) are used and the screen says "Starter model · not trained yet".

Scores are stored in `patient_risk` and refreshed when a doctor opens the list and a score is older than 6 hours or belongs to an older model. `risk_models` keeps every trained model with its test results. Both tables come from migration `017_adherence_risk.sql`.

## Privacy and access

- A doctor only sees patients who have a current prescription **from that doctor**. Another doctor never sees them.
- Opening the list is recorded in the audit log (`RISK_LIST_VIEW`). Training is recorded by the normal write audit.
- Only an administrator can train a model or see its test results.

## Try it

The sample data has very little reminder history, so a real model cannot be trained on it. Use made-up patients:

```bash
cd backend
node --env-file=.env.local scripts/seedAdherenceDemo.js            # 40 synthetic patients for Dr. Ananya Rao
node --env-file=.env.local scripts/trainRiskModel.js               # or press "Retrain model" in the admin Analytics tab
node --env-file=.env.local scripts/seedAdherenceDemo.js --remove   # delete the demo accounts again
```

(`npm run ml:seed-demo` and `npm run ml:train` do the same; pass extra options after `--`, for example `npm run ml:seed-demo -- --patients 60 --seed 7`.) The demo script refuses to write to a non-local database unless you add `--allow-remote`. Demo accounts cannot sign in.

## What the numbers mean, and the limits

- **The demo data is synthetic.** It is generated from hidden habits (how reliable a person is, harder evenings, getting better or worse over time, a small penalty for each extra medicine). A model trained on it learns the habits we put in. That shows the pipeline works end to end; it does **not** show how well it would do on real patients. Say this whenever the results are shown.
- **AUC** is the chance that a random patient who did go on to adhere poorly gets a higher score than one who did not (0.5 = a coin flip, 1.0 = perfect). On the synthetic data the trained model scores about 0.87.
- **"Simple rule"** is the same test for the one-line rule "last week's adherence predicts next week's". On the synthetic data it scores about the same (0.87–0.91), because the made-up habits are steady. So the model's main benefit today is the **explanations and the combined view**, not a large accuracy gain. On real data, where adherence changes with illness, side effects and routine, the comparison could turn out differently, and the screen always shows both numbers so nobody has to take our word for it.
- **Precision and recall** are measured at a score of 0.5. Precision is how many flagged patients really did adhere poorly; recall is how many of the poor adherers were flagged.
- Scores use balanced class weights, so they are inflated compared with a true probability. Read them as a ranking.
- Training examples from the same patient are correlated, and the split is by time, not by patient. This is fine for a ranking tool but makes the test results somewhat optimistic.
- Reminder answers are self-reported by the patient. A patient who never opens the app looks like a "missed" patient, which is a useful signal but not proof.

## Where the code is

| Part | File |
|---|---|
| Logistic regression, AUC | `backend/src/ml/logistic.js` |
| Inputs, training examples, scoring, reasons | `backend/src/ml/adherenceFeatures.js` |
| Synthetic patients (demo and tests) | `backend/src/ml/synthetic.js` |
| Database work, training, scoring | `backend/src/services/riskService.js` |
| Endpoints | `GET /api/doctors/me/at-risk`, `GET /api/admin/risk/model`, `POST /api/admin/risk/train` |
| Screens | `frontend/src/components/AdherenceRisk.jsx` (doctor), `AdminAnalytics.jsx` (admin) |
| Tests | `backend/test/risk.test.js` (no database), "adherence risk" test in `backend/test/api.test.js` |
