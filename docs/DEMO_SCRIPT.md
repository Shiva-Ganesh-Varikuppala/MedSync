# MedSync demo script (about 8 minutes)

**Before you start:** database loaded, `npm run dev:passwords` run, backend on port 5001, frontend open in a browser. Use three browser windows (or one normal and two private windows) so each role stays signed in. Reset the data first if the seed was changed.

## 1. Intro (30 s)
"MedSync connects the three people in a prescription's life: the doctor who writes it, the patient who follows it, and the pharmacy that supplies it."

## 2. Login security (45 s)
- Open the login page. Try a wrong password → **generic error**.
- Show the register form: there is **no role picker**. Public sign-up is patient-only.

## 3. Doctor (2.5 min), `ananya.rao@medsync.dev`
1. **Patients** tab → search "Arjun" → point out that no email or phone is shown → **Select**.
2. **New prescription** → diagnosis "Fever and pain" → add **Paracetamol** and **Ibuprofen**.
3. The **interaction warning** appears before saving. Say: "The warning informs the doctor; it does not block them."
4. Set dosage, frequency (twice daily) and dates → **Create prescription** → confirm.
5. **My prescriptions** → Details → show the items.

## 4. Patient (2 min), `arjun.kumar@medsync.dev` (second window)
1. **Today & reminders** → upcoming timetable shows the doses generated automatically from "twice daily" (08:00 and 20:00).
2. Mark a due dose **Taken**; the adherence percentage updates.
3. **My prescriptions** → Active / History → Details.

## 5. Doctor cancels (30 s)
Back in the doctor window: **My prescriptions** → open the new one → **Cancel prescription**. Refresh the patient window: its reminders have disappeared.

## 6. Pharmacy (2 min), `neha.patel@medsync.dev`
1. **Inventory** → badges for expired and expiring batches → apply `-5` to one batch.
2. **Receive stock** → search a medicine → add a batch that expires in 20 days.
3. **Alerts** → low stock and expiring within 30 days.
4. Mention: staff can only touch their own pharmacy's stock.

## 7. Closing (30 s)
Show `docs/SECURITY_CHECKLIST.md` and the passing `npm test` (19 integration tests). Mention the limitations list: it shows you know the next steps.

## Likely questions
- *Why 404 and not 403 for other people's records?* So attackers cannot learn which IDs exist.
- *Where is the token stored?* `sessionStorage`; cleared when the tab closes; trade-offs are in the checklist.
- *How are reminders made?* At prescription creation, from frequency per day, inside the same database transaction.
- *What if two pharmacists adjust stock at once?* The row is locked inside a transaction and stock cannot go negative.
