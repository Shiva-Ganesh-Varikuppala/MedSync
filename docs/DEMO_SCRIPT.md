# MedSync demo script (about 12 minutes)

**Before you start:** database loaded with all migrations (001 to 009), `npm run dev:passwords` run, backend on port 5001, frontend open in a browser. Use four browser windows (or one normal and three private windows) so each role stays signed in: doctor, patient, pharmacy, admin. Reset the data first if the seed was changed.

## 1. Intro (30 s)
"MedSync connects the people in a prescription's life: the doctor who writes it, the patient who follows it, the pharmacy that supplies it, and the administrator who keeps it running."

## 2. Login security (45 s)
- Open the login page. Try a wrong password → **generic error**. Mention that five wrong attempts lock the account for 15 minutes, and that the lock survives a server restart because it is stored in the database.
- Show the register form: there is **no role picker**. Public sign-up is patient-only.

## 3. Doctor (2.5 min), `ananya.rao@medsync.dev`
1. **Patients** tab → search "Arjun" → point out that no email or phone is shown → **Select**.
2. **New prescription** → diagnosis "Fever and pain" → add **Paracetamol** and **Ibuprofen**.
3. The **interaction warning** appears before saving. Say: "The warning informs the doctor; it does not block them. It also looks at the patient's other active medicines, not just this prescription."
4. Set dosage, frequency (twice daily) and dates → **Create prescription** → confirm.
5. **My prescriptions** → Details → show the items.

## 4. Patient (2.5 min), `arjun.kumar@medsync.dev` (second window)
1. **Today & reminders** → the timetable shows doses generated automatically from "twice daily" (08:00 and 20:00).
2. Mark a due dose **Taken**; the adherence percentage updates. Point at the **Missed doses** tile and "I took it late".
3. **My prescriptions** → Active / History → Details.
4. **Appointments** tab → pick Dr. Ananya Rao, tomorrow 11:30, reason "Blood pressure follow-up" → **Request appointment**. It shows "Waiting for the doctor".

## 5. Doctor answers the appointment (1 min)
Back in the doctor window: **Appointments** → **Confirm** (or **Reschedule** to another time). Try booking the same slot from another patient: it is refused. The patient's **Notifications** now shows the answer.

## 6. Doctor cancels (30 s)
**My prescriptions** → open the new one → **Cancel prescription**. Refresh the patient window: its reminders have disappeared.

## 7. Pharmacy (2.5 min), `neha.patel@medsync.dev`
1. **Inventory** → search a medicine, badges for expired and expiring batches → apply `-5` to one batch.
2. **Receive stock** → add a batch that expires in 20 days.
3. **Dispense** → open a pending prescription → stock is checked → dispense. Say: "Stock is deducted and the prescription is marked dispensed in one transaction."
4. **Alerts** → low stock and expiring within 30 days.
5. Mention: staff can only touch their own pharmacy's stock, and removed batches keep their dispensing history.

## 8. Administrator (1.5 min), `admin@medsync.dev`
1. **Users** → search, deactivate and reactivate an account, **Reset password** for a user.
2. **Automation** → **Run reminder tasks now** (missed doses and due reminders).
3. **Email and SMS** panel → shows whether delivery is on. With SMTP set up, **Send me a test email**.

## 9. Global search (30 s)
Type "para" in the top-bar search in each window. Say: "The same box gives each role different results; a doctor never finds another doctor's prescriptions."

## 10. Closing (30 s)
Show `docs/SECURITY_CHECKLIST.md` and the passing `npm test` (37 integration tests). Mention the limitations list: it shows you know the next steps.

## Likely questions
- *Why 404 and not 403 for other people's records?* So attackers cannot learn which IDs exist.
- *How are reminders made?* At prescription creation, from frequency per day, inside the same database transaction. A background job marks unanswered doses as missed after two hours.
- *What if two pharmacists adjust or dispense stock at once?* The rows are locked inside a transaction and stock cannot go negative.
- *What if two patients ask for the same appointment slot?* The doctor's rows are locked when confirming, so only one request can take a slot.
- *What happens if the mail server is down?* The notice is saved as FAILED with the reason and the booking or reminder still works.
