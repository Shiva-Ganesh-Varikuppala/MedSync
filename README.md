# MedSync

MedSync is a healthcare medication and prescription management application. Doctors write prescriptions, patients follow their medication schedule, and pharmacy staff manage stock. The system warns about drug interactions and creates dose reminders automatically.

**Team:** ShivaGanesh Varikuppala (Team Lead) · Aanyadhar Dubey

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express 5
- Database: MySQL 8
- Authentication: JWT (HS256) + bcrypt
- API: REST, base path `/api`, responses shaped `{ success, message, data }`

## Project structure

```text
MedSync/
├── frontend/    React app (pages/Doctor, Patient, Pharmacy, Login)
├── backend/     Express API (routes → controllers → services → MySQL)
├── database/    schema/, seeds/, migrations/
├── docs/        security checklist, demo script
├── diagrams/
└── README.md
```

## Run it locally

You need Node 20+ and MySQL 8.

1. **Database.** Run these in order: `database/schema/*.sql`, then `database/seeds/*.sql`, then `database/migrations/001_backend_support.sql`.
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

## Demo accounts (password `Test@12345` after `npm run dev:passwords`)

| Role | Email |
|---|---|
| Doctor | ananya.rao@medsync.dev, rahul.mehta@medsync.dev |
| Patient | arjun.kumar@medsync.dev, priya.sharma@medsync.dev, vikram.singh@medsync.dev |
| Pharmacy staff | neha.patel@medsync.dev, amit.verma@medsync.dev |

Public sign-up creates **patient** accounts only. Doctor and pharmacy accounts are created by an administrator (seed data or SQL).

## Tests

```bash
cd backend
npm test        # 19+ integration tests against a throw-away database named <DB_NAME>_test
```

## More

- `docs/SECURITY_CHECKLIST.md`: what is protected, and the known limitations.
- `docs/DEMO_SCRIPT.md`: a step-by-step script for the final presentation.
- `backend/README.md`: API reference.
