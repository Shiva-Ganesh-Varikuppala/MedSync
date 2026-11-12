# MedSync security checklist

Reviewed against the current code (40 automated tests pass). `[x]` means done and covered by the code or a test; `[ ]` means you still have to do it. The threat model is in `docs/THREAT_MODEL.md`.

## 1. What the project must show

- [x] **Login with role-based access.** Four roles; every route checks the role, then ownership. Strangers get 404, so ids cannot be probed. Public sign-up creates patients only.
- [x] **Hashed passwords.** bcrypt (cost 12). Login errors are generic, and timing does not reveal whether an email exists. Passwords and tokens are never returned or logged.
- [ ] **HTTPS.** The code is ready: `FORCE_HTTPS=true` redirects plain http, HSTS is sent over https, cookies are `Secure` in production. A real certificate needs the backend deployed behind a TLS terminator (for example Azure App Service). Until then, local runs use http on localhost. *Tick this when you have deployed it and checked `https://...` works.*
- [ ] **Secrets kept out of the repository.** `.env` is git-ignored and `.env.example` holds placeholders only. *Check:* `git log --all -p -S"AccountKey" -S"JWT_SECRET=" -- . ':!*.example'` and `git status` show nothing sensitive.
- [x] **Input validation against SQL injection.** Every query is parameterised; `LIKE` searches escape `%` and `_`; ids, dates, enums and lengths go through central validators; JSON body limit 100 KB.
- [x] **Input validation against cross-site scripting.** React escapes output and no `dangerouslySetInnerHTML` is used. The API sends `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`. Uploaded files: PDF, PNG, JPEG only, content checked, 5 MB, served as downloads.
- [x] **Firewall or network rule on the database.** The Azure Database for MySQL server allows only listed client IP addresses (Networking page). *Keep only the addresses you need; never leave a 0.0.0.0 to 255.255.255.255 rule.*
- [x] **Activity log.** `audit_logs` records logins, failed logins, every successful write, patient-history views and password resets. Azure's own **Activity log** records portal changes.

## 2. Authentication and sessions

- [x] Short-lived access token (1 hour); refresh token (30 days) rotates on use and a reused one revokes the whole family.
- [x] Password change, admin reset and deactivation revoke refresh tokens; the user is reloaded from the database on every request, so a disabled account stops working at once.
- [x] Login throttle: 5 failures per 15 minutes per account and IP; the same for password changes. Counters are in the database and survive restarts.
- [x] The tab's `Authorization` header wins over a cookie from another role in the same browser (tested).
- [x] Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production; the refresh cookie is limited to `/api/auth`.
- [x] The server refuses to start in production without `JWT_SECRET`.

## 3. Data protection

- [x] TLS to the database (`DB_SSL=true`); Azure encrypts the database and storage at rest by default.
- [x] Files live in a private Blob container; only the API reads and writes them, and access follows the prescription's visibility.
- [x] Patient search for doctors shows name, id, date of birth and gender only (no email or phone), after 2+ characters.
- [x] Pharmacy staff reach only their own pharmacy; removed batches are soft-deleted so history stays.
- [x] Multi-step changes are transactions; a database trigger stops stock going below zero.
- [x] Email and SMS are off until configured; reminder notify works on the patient's own reminders only.

## 4. Dependencies and configuration

- [x] `npm audit --omit=dev`: 0 vulnerabilities in the backend and the frontend. (A high-severity finding in `nodemailer` and one in `body-parser` were fixed by upgrading; `body-parser` is pinned through `overrides` in `backend/package.json`.)
- [x] Headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, CSP for API responses, HSTS over https, `X-Powered-By` removed.
- [x] CORS is off unless `CORS_ORIGIN` names one origin.

## 5. Known limitations (say these in the viva)

1. The access token is also kept in `sessionStorage` (the browser tab), so script injection could read it. It lasts 1 hour. The `HttpOnly` cookie alone would resist that better but would need a CSRF token; today CSRF protection relies on `SameSite=Lax`.
2. The API speaks HTTP; HTTPS comes from the deployment (proxy or App Service). The frontend's host should also send a content security policy.
3. The app connects to Azure MySQL with the server admin login. A separate database user with only the rights it needs would be safer.
4. No global per-IP rate limit; only logins and password changes are throttled.
5. No second factor and no email verification.
6. Any pharmacy staff member can edit the shared medicine catalogue.
7. Appointment times have no time zone handling, and there is no per-doctor schedule.
8. Email and SMS were tested against fake servers only, and Blob Storage against an emulator. Use the admin test buttons and a real upload once configured.
9. Power BI was not used; analytics are drawn in the app from SQL views.

## 6. Before you submit

- [ ] `JWT_SECRET` is a long random value, not the development default (`openssl rand -hex 48`).
- [ ] Demo passwords (`Test@12345`) are only on the demo machine; change or remove them on any shared server.
- [ ] `.env` is not committed (`git status` shows nothing for it) and has not been in an earlier commit.
- [ ] Azure firewall lists only the addresses you need.
- [ ] `npm test` passes on your MySQL; `npm run build` in `frontend/` succeeds; `npm audit --omit=dev` is clean in both folders.
- [ ] Screenshots: Azure firewall rules, Blob container set to Private, `audit_logs` rows, a failed-login lockout, the Activity log.
