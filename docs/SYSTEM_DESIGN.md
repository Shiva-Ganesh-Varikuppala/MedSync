# MedSync: system design

MedSync keeps a patient's prescriptions, reminders and pharmacy stock in one place. Doctors write prescriptions, patients follow them, pharmacies fill them, and an admin looks after accounts.

## 1. Requirements

### Functional

| Role | Needs |
|---|---|
| Patient | Sign in, see active and past prescriptions, get dose reminders and mark them taken or skipped, add extra reminders, request and cancel appointments, download files on a prescription, change own profile and password |
| Doctor | See own patients, write a prescription (with a check for dangerous medicine pairs, including other doctors' medicines), reuse or save prescription templates, cancel it, attach files, confirm, decline, move or complete appointments |
| Pharmacy staff | Manage the pharmacy's medicine batches (add, edit, remove, expiry and low-stock reports), see pending prescriptions, dispense with stock checks, see dispensing history |
| Admin | Create doctor, pharmacy and admin accounts, deactivate users, reset passwords, view analytics, run and inspect the reminder scheduler, check email and SMS delivery |
| Everyone | Search (scoped to what the role may see), notifications, an audit trail of every change |

### Non-functional

| Quality | What MedSync does | Where |
|---|---|---|
| Security | Passwords hashed with bcrypt; short-lived access token plus rotating refresh token with reuse detection; role checks on every route; ownership checks (other people's records answer 404); lockout after repeated failed logins, stored in the database; input validation and parameterised SQL; secrets in `.env` only | `docs/SECURITY_CHECKLIST.md` |
| Privacy | Health data visible only to the people involved; search results hide contact details; files served only through the API | `docs/DATA_CLASSIFICATION.md` |
| Integrity | Multi-step changes (create prescription, dispense, book appointment) are database transactions; stock cannot go negative (trigger); soft-deleted batches keep history | `docs/DATABASE_DESIGN.md` |
| Auditability | Every successful write is recorded with user, action, entity and IP | `audit_logs` |
| Performance | Indexes on searched columns; every list is paged or capped; reports computed in SQL | `database/` |
| Availability | Health endpoint reports database connectivity; the database is a managed Azure service (backups are configured in the portal) | `GET /api/health` |
| Maintainability | Layers (routes, services, utils), numbered migrations with a runner, 41 automated tests against a real MySQL | `backend/test/` |
| Portability | Runs on any MySQL 8; Azure settings (TLS, time zone, Blob Storage) are environment variables; files fall back to a local folder | `backend/.env.example` |

Out of scope for this version: payments, video consultations, mobile apps, multi-hospital tenancy.

## 2. Architecture

![Architecture](architecture.png)

- **Browser:** a React single-page app (built with Vite). One shell, one screen set per role. It only talks to the API.
- **API:** one Node.js and Express program. Requests pass through middleware (security headers, body parsing, token check, role check, audit), then a route, then a service that holds the business rules and runs the SQL.
- **Scheduler:** a timer inside the API process, every 60 seconds. It marks overdue doses as missed and sends reminder alerts.
- **Azure Database for MySQL:** the system of record (20 tables, 3 views, triggers and a stored procedure). The API connects over TLS and the server's firewall lists the allowed IP addresses.
- **Azure Blob Storage:** a private container for prescription files. The database keeps only their records.
- **Outside services:** an SMTP server and Twilio for email and SMS (optional, off until configured), and the NIH RxNorm service for looking up medicine names (with a built-in fallback).

HTTPS: the API itself speaks HTTP. In a deployment it sits behind a TLS terminator (Azure App Service, a reverse proxy or a gateway), which is also where the `trust proxy` setting matters. Locally, development runs over HTTP on localhost.

### Data flow: from prescription to dispensing

![Data flow](dispense-flow.png)

The two writes that matter most are single transactions. Writing a prescription saves the header, items, generated reminders and audit row together or not at all. Dispensing locks the batch rows, takes stock from the batch that expires first, records what was handed out, and marks the prescription dispensed, or changes nothing if stock is short.

## 3. API list

Base path `/api`. Every response is `{ success, message, data }`. All routes except `/health`, `/auth/register`, `/auth/login` and `/auth/refresh` need a sign-in; the role column says who may call them.

| Area | Endpoints | Who |
|---|---|---|
| Health | `GET /health` | anyone |
| Auth | `POST /auth/register` (patients only), `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET` and `PUT /auth/me`, `PUT /auth/password` | anyone / signed in |
| Patient | `GET /patients/me`, `/patients/me/reminders`, `/patients/me/notifications`, `/patients/me/prescriptions` (`/active`, `/:id`) | patient |
| Doctor | `GET /doctors/me`, `/doctors/me/prescriptions`, `/doctors/patients` (`/:id`, `/:id/current-medicines`, `/:id/prescriptions`) | doctor |
| Templates | `GET /templates`, `POST /templates`, `DELETE /templates/:id` (a doctor's saved prescription courses, such as "fever") | doctor, own templates only |
| Prescriptions | `POST /prescriptions`, `POST /prescriptions/:id/cancel`, `GET /prescriptions/:id` and `/:id/items`, `GET` and `POST /prescriptions/:id/attachments` | doctor writes; the people involved read |
| Files | `GET /attachments/:id/download`, `DELETE /attachments/:id` | the people involved read; the author deletes |
| Medicines | `GET /medicines`, `/medicines/search`, `/medicines/:id`, `/medicines/external/*`; `POST`, `PUT`, `DELETE` | everyone reads; pharmacy staff write |
| Interactions | `GET /interactions/check`, `/interactions/:medicineId` | signed in |
| Reminders | `GET /reminders`, `/reminders/due`; `POST /reminders`; `PATCH /reminders/:id/status`; `DELETE /reminders/:id`; `POST /reminders/:id/notify` | patient |
| Pharmacy | `GET /pharmacies`, `/pharmacies/:id/inventory`, `/low-stock`, `/expiring`, `/prescriptions/pending`, `/prescriptions/:rx/stock`, `/dispensations`; `POST /pharmacies/:id/batches`, `POST /pharmacies/:id/prescriptions/:rx/dispense` | pharmacy staff (own pharmacy) |
| Batches | `PUT /batches/:id`, `PATCH /batches/:id/quantity`, `DELETE /batches/:id` | pharmacy staff |
| Appointments | `GET /appointments`, `GET /appointments/doctors`, `POST /appointments`, `POST /appointments/:id/cancel`; `POST /appointments/:id/confirm`, `/decline`, `/reschedule`, `/complete` | patient books and cancels; doctor answers |
| Search | `GET /search?q=` | signed in (results depend on role) |
| Admin | `GET /admin/summary`, `/admin/analytics`, `/admin/users`, `/admin/delivery`; `POST /admin/users`, `/admin/pharmacies`, `/admin/cron/run`, `/admin/delivery/test`; `PATCH /admin/users/:id/active`; `POST /admin/users/:id/password` | admin |

The full request and response examples are in `backend/README.md`.

## 4. Trade-off: one modular monolith, not separate services

**Decision.** MedSync is one deployable API with clear internal modules (auth, prescriptions, pharmacy, reminders, appointments, search), not a set of microservices.

**Why.**
- **Transactions.** Dispensing touches stock, dispensed items and prescription status; creating a prescription touches prescriptions, items and reminders. In one program with one database these are ordinary transactions that either fully happen or not at all. Split across services, the same steps would need sagas or compensation logic, and a half-finished dispense in a pharmacy system is the failure we least want.
- **Size.** Two developers and one database. Separate services would add network calls, deployment pipelines and duplicated login logic for no gain in speed or reliability at this scale.
- **Testability.** All 41 tests run the real API against a real MySQL in under half a minute.

**What it costs.**
- The whole API scales as one unit. If reminders or search ever need more capacity than the rest, they cannot be scaled alone.
- The scheduler runs inside the API process, so with two copies of the API running, both would run it. Marking a dose missed twice is harmless (the update only changes doses that are still pending), but duplicate alerts would be possible.
- One bad deploy affects every role.

**When to revisit.** If the reminder scheduler needs to run on its own or send in volume, it is the first thing to split out: a separate worker program reading the same `reminders` table, with the database as the queue. The modules already talk through service functions, so that cut is cheap.

**Also considered, and not done.**
- **Caching.** A cache such as Redis in front of reads was not added: the lists are small and indexed, and stale stock or reminder data in a medical app is worse than a slightly slower page.
- **Direct-to-storage file links.** Letting the browser download from Blob Storage with expiring links would save API bandwidth, but it moves the permission check outside our code. Streaming through the API keeps one access rule; at a 5 MB limit the cost is small.
