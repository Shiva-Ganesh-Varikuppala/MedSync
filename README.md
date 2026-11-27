# MedSync

MedSync is a healthcare medication and prescription management application. Doctors write prescriptions, patients follow their medication schedule and book appointments, pharmacy staff dispense and manage stock, and an administrator looks after accounts. The system warns about drug interactions, creates dose reminders automatically, and can send them by email or SMS.

**Team:** ShivaGanesh Varikuppala (Team Lead) · Aanyadhar Dubey

## What each role can do

| Role | Main features |
|---|---|
| **Doctor** | Overview dashboard, search patients, write prescriptions with an interaction warning (it also checks the patient's other active medicines) and reusable templates, cancel prescriptions, attach files, answer appointment requests (confirm, decline with a reason, reschedule, mark completed), a **Schedule** calendar of appointments and course follow-ups, **refill requests** (approve creates a new prescription, or decline with a reason), and an **Adherence risk** list that ranks their patients by how likely they are to miss doses in the next week, with reasons (machine learning, advisory only, see `docs/ADHERENCE_RISK.md`). |
| **Patient** | Overview dashboard, today's dose timetable (generated from the prescription), mark doses taken, skipped or late, missed doses and adherence, a **care calendar** (doses and appointments, exportable as `.ics`), view prescriptions, book and cancel appointments, **request refills**, read notifications, download their own data (JSON or CSV) and a prescription as PDF. |
| **Pharmacy staff** | Overview dashboard, inventory with search and paging, receive stock, adjust quantities, remove batches (history is kept), low-stock and expiring alerts, an **expiry calendar**, **dispense prescriptions** (stock is checked and deducted in one transaction), medicine catalog. |
| **Administrator** | Create doctor and pharmacy-staff accounts, deactivate or reactivate users, reset a password, permanently delete an account (type its email to confirm), create pharmacies, analytics, CSV reports, an **audit log viewer** (search and filter who did what), run the reminder jobs, check email and SMS delivery, and see and retrain the adherence-risk model. |
| **Everyone** | A search box in the top bar (it only finds what that role is allowed to see), light and dark theme, English / Hindi / Telugu (partly translated, see `docs/LANGUAGES.md`), and addresses that match the open tab so links, Back and reload work. |

Accounts sign up with email verification, and phone verification is available for SMS (see `docs/EMAIL_VERIFICATION.md`, `docs/PHONE_VERIFICATION.md`).

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express 5
- Database: MySQL 8
- Authentication: JWT + refresh tokens, bcrypt
- Optional delivery: SMTP email (nodemailer) and SMS (Twilio)
- Optional file storage: Azure Blob Storage for attachments (a local folder is used when it is not set up)
- API: REST, base path `/api`, responses shaped `{ success, message, data }`

## Project structure

```text
MedSync/
├── frontend/    React app (pages, components, styles)
├── backend/     Express API (routes → controllers → services → MySQL)
├── database/    schema/, seeds/, migrations/ (001 to 017)
├── docs/        design, security, feature guides, demo script
├── diagrams/
└── README.md
```

## Run it locally

You need Node 20+ and MySQL 8.

1. **Database.** Create the schema and seed data, then run **every migration in order**:
   ```bash
   mysql -u YOUR_DB_USER -p < database/schema/01_all.sql
   mysql -u YOUR_DB_USER -p < database/seeds/01_all.sql
   for f in database/migrations/*.sql; do mysql -u YOUR_DB_USER -p medsync < "$f"; done
   ```
   (Each migration asks for the password. If a migration says something "already exists", it was applied before and you can carry on.)

   Easier: after setting `backend/.env`, run `npm run db:migrate -- --seed` in `backend`. It creates the database, applies every file in order, remembers what it applied, and needs no `mysql` command-line client. If you already ran the files by hand, run `npm run db:migrate -- --baseline` once first.

   Keep your database up to date: when you pull new code, run `npm run db:migrate` again. Features such as phone verification (015) and refill requests (016) and adherence risk (017) need their migrations, otherwise the API returns errors like "Unknown column".
2. **Backend.**
   ```bash
   cd backend
   cp .env.example .env        # then edit DB_* and set JWT_SECRET to a long random string
   npm install
   npm run dev:passwords       # development only: sets every seed user's password to Test@12345
   npm run dev                 # API on http://localhost:5001
   ```
3. **Frontend.**
   ```bash
   cd frontend
   npm install
   npm run dev                 # open the URL it prints; /api is proxied to the backend
   ```

### Optional: email and SMS

Reminders and notices always appear inside the app. To also send them by email or text, add the settings listed in `backend/.env.example` (`SMTP_*` for email, `TWILIO_*` for SMS) and restart the backend. In the admin screen, **Automation → Email and SMS** shows what is switched on and can send you a test message.

## Demo accounts (password `Test@12345` after executing `npm run dev:passwords`)

| Role | Email |
|---|---|
| Administrator | admin@medsync.dev |
| Doctor | ananya.rao@medsync.dev, rahul.mehta@medsync.dev |
| Patient | arjun.kumar@medsync.dev, priya.sharma@medsync.dev, vikram.singh@medsync.dev |
| Pharmacy staff | neha.patel@medsync.dev, amit.verma@medsync.dev |

Public sign-up creates **patient** accounts only. Doctor, pharmacy and admin accounts are created by an administrator.

## Tests

```bash
cd backend
npm test        # integration tests against a throw-away database named <DB_NAME>_test
```

The tests cover sign-in and roles, prescriptions and interaction checks, reminders, dispensing, appointments, calendars, refill requests, exports, the audit log viewer, the adherence-risk model (its maths also has database-free tests in `backend/test/risk.test.js`) and more. They never send real email or SMS, even if `backend/.env` has SMTP or Twilio settings. Run them on your own MySQL 8 before submitting. If your database server and your computer use different time zones, start it with the same zone as your computer, or a few expiry-date tests can fail around midnight.

## More

- `docs/AZURE_DATABASE.md`: moving the database to Azure Database for MySQL, step by step. `docs/AZURE_BLOB_STORAGE.md`: attachment storage.
- `docs/SYSTEM_DESIGN.md`, `docs/DATABASE_DESIGN.md`, `docs/THREAT_MODEL.md`, `docs/DATA_CLASSIFICATION.md`: design and security background.
- Feature guides: `docs/CARE_CALENDAR.md`, `docs/REFILL_REQUESTS.md`, `docs/AUDIT_VIEWER.md`, `docs/LANGUAGES.md`, `docs/ADHERENCE_RISK.md`.
- `docs/SECURITY_CHECKLIST.md`: what is protected, and the known limitations.
- `docs/DEMO_SCRIPT.md`: a step-by-step script for the final presentation.
- `backend/README.md`: API reference.
