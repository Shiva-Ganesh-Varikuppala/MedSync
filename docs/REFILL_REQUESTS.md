# Refill requests

A patient can ask the doctor who wrote a prescription to renew it. The doctor approves (a **new** prescription is created) or declines with a reason. The original prescription is never changed.

## Rules

* A refill can be requested when the prescription is not cancelled and its **last course ends within 7 days from today, or ended up to 30 days ago** (`REFILL_DAYS_BEFORE_END` / `REFILL_DAYS_AFTER_END` can change this).
* One open request per prescription, and at most 3 open requests per patient.
* The prescribing doctor must still have an active account.
* **Approve** copies the medicines, dosage, frequency and course length into a new prescription starting today. It goes through the normal `prescriptionService.create`, so reminders, the interaction check and the audit trail are the same as for any prescription. If the check finds a SEVERE interaction, the doctor must send `interaction_override_reason` (the screen asks for it). If creating the prescription fails, the request goes back to "waiting".
* Strangers get 404 (ids cannot be probed). Every step is audited: `REFILL_REQUEST`, `REFILL_APPROVE`, `REFILL_DECLINE`, `REFILL_CANCEL`. The other side is notified by email/in-app notification.

## API (`/api/refills`)

| Method and path | Who | What |
| --- | --- | --- |
| `GET /eligible` | patient | prescriptions that can be refilled now (`has_open` shows a request already sent) |
| `POST /` `{prescription_id, note?}` | patient | ask for a refill |
| `POST /:id/cancel` | patient | withdraw an open request |
| `GET /?status=&limit=&page=` | patient, doctor | own requests, open ones first |
| `POST /:id/approve` `{note?, interaction_override_reason?}` | doctor | creates the new prescription (`new_prescription_id`) |
| `POST /:id/decline` `{note}` | doctor | reason is required (3+ characters) |

## Database

Migration `database/migrations/016_refill_requests.sql` adds the table `refill_requests`. Rows are removed automatically with their patient, doctor or prescription (so the admin permanent delete keeps working).

Apply it locally with `node --env-file=.env.local scripts/migrate.js` from `backend/`. Azure needs migrations 012 to 016 at the final review.

## Screens

* Patient: **Refills** tab (request, history, cancel) and a "Ready to refill" card on Overview.
* Doctor: **Refills** tab (approve, decline) and a "Refill requests" card on Overview.

Files: `backend/src/services/refillService.js`, `backend/src/routes/refillRoutes.js`, `frontend/src/components/Refills.jsx`.
