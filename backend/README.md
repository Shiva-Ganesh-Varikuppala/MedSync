# MedSync Backend

## Run locally

1. Create `backend/.env` from `.env.example`, setting the database login and a JWT secret of at least 32 characters.
2. Apply `database/schema`, `database/seeds`, then **all** files in `database/migrations/` in order (001 to 009).
3. Run `npm install` and `npm run dev` (or `npm start`). The default API address is `http://localhost:5001/api`.
4. Development only: `npm run dev:passwords` sets every seed user's password to `Test@12345`.

Background jobs (marking missed doses, sending due reminders) start with the server and run every minute. An administrator can also run them on demand.

## Conventions

- Base path `/api`. Every response is `{ success, message, data }`; lists may add `meta` (for example `{ has_more }`).
- Sign in with `POST /api/auth/login`. The API sets HttpOnly cookies and also returns a token to send as `Authorization: Bearer <token>`.
- A user asking for someone else's record gets **404**, never 403, so IDs cannot be probed.
- Paged lists accept `limit` and `page`.
- Every mutating request is written to the audit table.

## API reference

**Auth** `/auth`: `POST /register` (patients only), `POST /login` (5 failures per 15 minutes are blocked), `POST /refresh`, `POST /logout`, `GET /me`, `PUT /me`, `PUT /password`.

**Doctor** `/doctors` (role DOCTOR): `GET /me`, `GET /me/prescriptions`, `GET /patients?q=&limit=&page=`, `GET /patients/:id`, `GET /patients/:id/current-medicines`, `GET /patients/:id/prescriptions`.

**Prescriptions** `/prescriptions`: `POST /` (doctor), `POST /:id/cancel` (doctor), `GET /:id`, `GET /:id/items`.

**Patient** `/patients` (role PATIENT): `GET /me`, `GET /me/notifications`, `GET /me/reminders`, `GET /me/prescriptions`, `GET /me/prescriptions/active`, `GET /me/prescriptions/:id`.

**Reminders** `/reminders` (role PATIENT): `POST /`, `GET /`, `GET /due`, `PATCH /:id/status` (TAKEN, SKIPPED or PENDING), `DELETE /:id` (only upcoming unanswered doses), `POST /:id/notify` (own reminders only).

**Appointments** `/appointments`: patients: `GET /doctors`, `POST /`, `POST /:id/cancel`; doctors: `POST /:id/confirm`, `/:id/decline` (needs `note`), `/:id/reschedule` (needs `scheduled_at`), `/:id/complete`; both: `GET /?when=upcoming|past&status=&limit=&page=`. Slots are on the hour or half hour, 08:00 to 19:30, up to 90 days ahead; a doctor cannot be double-booked and a patient can hold at most 5 upcoming appointments.

**Medicines** `/medicines`: `GET /`, `GET /search`, `GET /:id`, `GET /external/search`, `GET /external/forms`, `GET /external/properties/:rxcui`; `POST /`, `PUT /:id`, `DELETE /:id` (pharmacy staff). `GET /api/interactions/check` and `GET /api/interactions/:medicineId` check interactions.

**Pharmacy** `/pharmacies` (role PHARMACY_STAFF, own pharmacy only): `GET /`, `GET /:id`, `GET /:id/inventory?q=&limit=&page=`, `GET /:id/low-stock`, `GET /:id/expiring`, `POST /:id/batches`, `GET /:id/prescriptions/pending`, `GET /:id/prescriptions/:rxId/stock`, `POST /:id/prescriptions/:rxId/dispense`, `GET /:id/dispensations`. **Batches** `/batches`: `PUT /:id`, `PATCH /:id/quantity`, `DELETE /:id` (soft delete, history is kept).

**Search** `GET /api/search?q=` (2+ characters, any signed-in role): results are limited to what that role may see.

**Admin** `/admin` (role ADMIN): `GET /summary`, `GET /users?q=&role=&limit=&page=`, `POST /users`, `PATCH /users/:id/active`, `POST /users/:id/password`, `POST /pharmacies`, `POST /cron/run`, `GET /delivery`, `POST /delivery/test` (`channel` is EMAIL or SMS; sends to the admin's own address or phone).

## Email and SMS

Off by default. Set `SMTP_HOST` (and `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) for email, and `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` for SMS. A failed send is stored on the notification as `FAILED` with the reason; it never breaks the action that caused it.

## Production checklist

- Set `NODE_ENV=production` and provide secret-managed database credentials and a unique JWT secret.
- Apply migrations before release; terminate TLS at a reverse proxy.
- Restrict CORS to the deployed frontend origin and run API tests against an isolated MySQL database in CI.
