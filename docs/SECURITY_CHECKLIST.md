# MedSync security checklist

Status as of the Phase 6 review. Use this in the report and viva: it shows what was done on purpose and what is known.

## Implemented

| Area | What we do |
|---|---|
| Passwords | Hashed with bcrypt. Login errors are generic ("Invalid email or password"); login timing does not reveal whether an email exists. |
| Brute force | Login throttle: 5 failures per 15 minutes per account/IP, then temporarily blocked. Change-password guesses are limited the same way. Both counters are stored in the database, so a restart does not clear them. |
| Sessions | JWT signed with `JWT_SECRET` (the server refuses to start in production without it), default lifetime 1 day. The user is reloaded from the database on every request, so a disabled account stops working immediately. |
| Frontend session | Kept in `sessionStorage` (cleared when the tab closes); auto sign-out at token expiry and on any 401. |
| Roles | Every route checks the role first, then ownership. A doctor, patient or pharmacy user asking for someone else's record gets **404**, so IDs cannot be probed. |
| Registration | Public sign-up creates patients only. Doctor and pharmacy accounts cannot be self-created. |
| Patient search | Doctors see name, ID, date of birth and gender only (no email or phone), and need 2+ characters, so the registry cannot be dumped. |
| Pharmacy scope | Staff can only read and change batches of their own pharmacy. Removed batches are soft-deleted, so dispensing history stays intact. |
| Appointments | Patients and doctors only see their own; strangers get 404. Confirmation locks the doctor's rows so a slot cannot be double-booked. |
| Search | One endpoint, but each role's query only reaches that role's own data (a patient's own prescriptions, a pharmacy's own stock). `%` and `_` are plain text. |
| Email and SMS | Off unless configured in `.env`. Passwords and tokens are never returned by the API or logged. A failed send is stored on the notification and never breaks the action. Reminder notify is limited to the patient's own reminders. |
| Admin password reset | Admin can reset another user's password (not their own). It revokes that user's refresh tokens and is audited. |
| SQL injection | All queries are parameterised; LIKE searches escape `%` and `_`. |
| Input validation | Central validators (types, ranges, dates, enums, lengths). Request body limit 100 KB. |
| Data integrity | Prescription creation (items + reminders) is one transaction; stock adjustments lock the row and cannot go below zero. |
| Audit trail | Logins, failed logins, prescription create/cancel, patient-history views and all mutating requests are written to the audit table. |
| Headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `X-Powered-By` removed. |
| XSS | React escapes output; no `dangerouslySetInnerHTML` anywhere. |
| Dependencies | `npm audit --omit=dev`: 0 known vulnerabilities in backend and frontend at review time. |
| Secrets | `.env` is git-ignored; `.env.example` holds placeholders only. |

## Known limitations (be honest about these in the viva)

1. The JWT is returned in the JSON body and stored in `sessionStorage`. An HttpOnly cookie would resist XSS theft better, but needs CSRF protection too.
2. Patients can create their own reminders, and delete only ones that are upcoming and unanswered. Missed doses cannot be deleted.
3. Any pharmacy staff member can edit the shared medicine catalog.
4. A doctor's patient history list shows only prescriptions that doctor wrote. The interaction warning does look at the patient's other active medicines, but the full history of other doctors is not shown.
5. No HTTPS in development. In production, terminate TLS at a reverse proxy and add HSTS.
6. Appointment times are plain local clinic times with no time zone handling, and there is no per-doctor working schedule (clinic hours are the same for everyone).
7. SMS and email delivery have not been tested against real providers, only against fake servers. Use the admin test buttons once configured.
8. The 37 backend tests pass on MySQL 8.0 (strict mode) and MariaDB in our test setup; run `npm test` on your own MySQL before submitting, with the database and computer in the same time zone.

## Before you submit

- [ ] `JWT_SECRET` is a long random value, not the development default.
- [ ] Demo passwords (`Test@12345`) are only used on the demo machine.
- [ ] `.env` is not committed (`git status` shows nothing for it).
- [ ] `npm test` passes on your MySQL.
- [ ] `npm run build` in `frontend/` succeeds.
