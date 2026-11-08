# MedSync

MedSync is a healthcare medication and prescription management application. Doctors write prescriptions, patients follow their medication schedule and book appointments, pharmacy staff dispense and manage stock, and an administrator looks after accounts. The system warns about drug interactions, creates dose reminders automatically, and can send them by email or SMS.

**Team:** ShivaGanesh Varikuppala (Team Lead) · Aanyadhar Dubey

## What each role can do

| Role | Main features |
|---|---|
| **Doctor** | Search patients, write prescriptions with an interaction warning (it also checks the patient's other active medicines), cancel prescriptions, see their own prescriptions, answer appointment requests (confirm, decline with a reason, reschedule, mark completed). |
| **Patient** | Today's dose timetable (generated from the prescription), mark doses taken, skipped or late, see missed doses and adherence, view prescriptions, book and cancel appointments, read notifications. |
| **Pharmacy staff** | Inventory with search and paging, receive stock, adjust quantities, remove batches (history is kept), low-stock and expiring alerts, **dispense prescriptions** (stock is checked and deducted in one transaction), medicine catalog. |
| **Administrator** | Create doctor, pharmacy and admin accounts, deactivate or reactivate users, reset a password, create pharmacies, run the reminder jobs, check email and SMS delivery. |
| **Everyone** | A search box in the top bar. It only finds what that role is allowed to see. |

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express 5
- Database: MySQL 8
- Authentication: JWT + refresh tokens, bcrypt
- Optional delivery: SMTP email (nodemailer) and SMS (Twilio)
- API: REST, base path `/api`, responses shaped `{ success, message, data }`

## Project structure

```text
MedSync/
├── frontend/    React app (pages, components, styles)
├── backend/     Express API (routes → controllers → services → MySQL)
├── database/    schema/, seeds/, migrations/ (001 to 009)
├── docs/        security checklist, demo script
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

## Demo accounts (password `Test@12345` after `npm run dev:passwords`)

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
npm test        # 37 integration tests against a throw-away database named <DB_NAME>_test
```

All 37 tests pass on MySQL 8.0 in strict mode (the default on most installs) and on MariaDB. Run them on your own MySQL before submitting. If your database server and your computer use different time zones, start it with the same zone as your computer, or a few expiry-date tests can fail around midnight.

## More

- `docs/AZURE_DATABASE.md`: moving the database to Azure Database for MySQL, step by step.
- `docs/SECURITY_CHECKLIST.md`: what is protected, and the known limitations.
- `docs/DEMO_SCRIPT.md`: a step-by-step script for the final presentation.
- `backend/README.md`: API reference.
