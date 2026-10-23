# MedSync security checklist

Status as of the Phase 6 review. Use this in the report and viva: it shows what was done on purpose and what is known.

## Implemented

| Area | What we do |
|---|---|
| Passwords | Hashed with bcrypt. Login errors are generic ("Invalid email or password"); login timing does not reveal whether an email exists. |
| Brute force | Login throttle: 5 failures per 15 minutes per account/IP, then temporarily blocked. |
| Sessions | JWT signed with `JWT_SECRET` (the server refuses to start in production without it), default lifetime 1 day. The user is reloaded from the database on every request, so a disabled account stops working immediately. |
| Frontend session | Kept in `sessionStorage` (cleared when the tab closes); auto sign-out at token expiry and on any 401. |
| Roles | Every route checks the role first, then ownership. A doctor, patient or pharmacy user asking for someone else's record gets **404**, so IDs cannot be probed. |
| Registration | Public sign-up creates patients only. Doctor and pharmacy accounts cannot be self-created. |
| Patient search | Doctors see name, ID, date of birth and gender only (no email or phone), and need 2+ characters, so the registry cannot be dumped. |
| Pharmacy scope | Staff can only read and change batches of their own pharmacy. |
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
2. Patients can create and delete their own reminders.
3. Batches are hard-deleted (only offered in the UI for expired ones).
4. Any pharmacy staff member can edit the shared medicine catalog.
5. A doctor's patient history shows only prescriptions that doctor wrote. Cross-doctor history (important for real interaction safety) is not shown.
6. The login throttle is in memory, so it resets when the server restarts and does not work across several server instances.
7. No HTTPS in development. In production, terminate TLS at a reverse proxy and add HSTS.
8. The 19 backend tests were run on MariaDB; run `npm test` on your own MySQL 8 before submitting.

## Before you submit

- [ ] `JWT_SECRET` is a long random value, not the development default.
- [ ] Demo passwords (`Test@12345`) are only used on the demo machine.
- [ ] `.env` is not committed (`git status` shows nothing for it).
- [ ] `npm test` passes on your MySQL.
- [ ] `npm run build` in `frontend/` succeeds.
