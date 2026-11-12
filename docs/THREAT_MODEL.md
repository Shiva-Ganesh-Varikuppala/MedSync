# MedSync: threat model (one page)

## What we protect

| Asset | Why it matters |
|---|---|
| Prescriptions, diagnoses, reminders, appointments, attached files | Health data: private by law and by trust |
| Passwords, access and refresh tokens, the database and storage keys | Whoever holds them acts as someone else |
| Pharmacy stock and dispensing records | Wrong stock means wrong or unsafe dispensing |
| Audit log | The only proof of who did what |

## Who might attack, and where the boundaries are

- **Anonymous internet user:** can reach the login and registration routes only.
- **Signed-in patient or doctor trying to read someone else's data** (the most likely attack).
- **Insider:** a doctor, pharmacy staff member or admin misusing their own access.
- **Thief:** stolen laptop, stolen token, leaked `.env` or repository.
- **Trust boundaries:** browser to API (HTTPS at the edge), API to MySQL (TLS plus Azure firewall), API to Blob Storage (HTTPS plus key), API to email, SMS and RxNorm.

## Threats and what answers them

| # | Threat | Control in MedSync | What is left |
|---|---|---|---|
| 1 | Guessing passwords | bcrypt hashes, generic login errors, 5 failures per 15 minutes per account and IP (kept in the database), same limit on password changes | No second factor |
| 2 | Stolen session token | Access token lasts 1 hour; refresh token rotates and a reused one signs the user out everywhere; password change, reset and deactivation revoke tokens; the user is reloaded from the database on each request | A token stolen from the tab stays usable until it expires |
| 3 | Reading another person's records (broken access control) | Role check, then ownership check on every route; strangers get 404, so ids cannot be probed; tested for each role | None known |
| 4 | SQL injection | Every query is parameterised; `LIKE` input is escaped; ids are validated as integers | None known |
| 5 | Cross-site scripting | React escapes all output and no `innerHTML` is used; the API returns only JSON and downloads with `nosniff` and a `default-src 'none'` policy; uploads are limited to PDF, PNG, JPEG, checked by their first bytes, and always sent as downloads | The site that serves the frontend should also send a content security policy |
| 6 | Cross-site request forgery | The tab's Bearer token wins over cookies; the cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production; CORS is off unless one origin is configured | No CSRF token; protection rests on `SameSite` |
| 7 | Becoming a doctor or admin by registering | Public sign-up creates patients only; other roles are created by an admin | None known |
| 8 | Eavesdropping or tampering in transit | TLS to the database (`DB_SSL=true`); `FORCE_HTTPS` redirects plain http and HSTS is sent over https; Blob Storage is https only | The API itself needs a TLS terminator in front (App Service, proxy) |
| 9 | Exposed database or storage | Azure firewall allows only listed IP addresses; the container is private with anonymous access disabled; Azure encrypts both at rest by default | The app signs in with the server admin login; a limited-rights database user would be safer |
| 10 | Leaked secrets | `.env` is git-ignored, `.env.example` holds placeholders, the API never returns secrets (tested), the server refuses to start in production without `JWT_SECRET` | Must be checked in the real repository history |
| 11 | Insider misuse | Every write is audited with user, action, entity and IP; viewing a patient's history is audited; admin password resets are audited and cannot target oneself; pharmacy staff see only their own pharmacy | Admins can read everything; the audit log is in the same database |
| 12 | Tampering with stock | Transactions with row locks; a trigger blocks negative stock; removed batches are soft-deleted | None known |
| 13 | Overload and abuse | 100 KB JSON limit, 5 MB file limit, paged lists, throttled logins | No global rate limit per IP |
| 14 | Vulnerable dependencies | `npm audit` at review time: 0 vulnerabilities in the backend and the frontend (two high findings in the mail library and body parser were fixed on the way) | Re-run before each release |

## Where to see the activity

- **Application:** the `audit_logs` table (who, what, when, from which IP).
- **Azure:** the **Activity log** page of the MySQL server and of the storage account (who changed firewall rules, keys or settings in the portal).
