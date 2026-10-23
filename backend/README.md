# MedSync Backend

## Run locally

1. Create `backend/.env` from `.env.example`, setting a database password and a JWT secret of at least 32 characters.
2. Apply the schema, seed data, then `database/migrations/001_backend_support.sql`.
3. Run `npm install` and `npm start`. The default API address is `http://localhost:5001/api`.

## Authentication and API groups

Obtain a token through `POST /api/auth/login`, then send `Authorization: Bearer <token>`.
Routes: `/health`, `/auth`, `/doctors`, `/patients`, `/prescriptions`, `/medicines`, `/interactions`, `/reminders`, `/pharmacies`, and `/batches`.

## Production checklist

- Set `NODE_ENV=production` and provide secret-managed database credentials and a unique JWT secret.
- Apply migrations before release; terminate TLS at a reverse proxy.
- Restrict CORS to the deployed frontend origin and run API tests against an isolated MySQL database in CI.
