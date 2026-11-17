# Patient email verification

New patients must confirm their email address before they can sign in. Doctors, pharmacy staff and
administrators are created by an administrator and are **not** affected.

## Flow

1. `POST /api/auth/register` creates the patient with `users.email_verified_at = NULL`, stores a single-use token
   (only its SHA-256 hash, valid 24 hours) in `email_verifications`, and — after the database commit — emails the link.
2. The app shows a "Check your inbox" screen with a **Resend** button.
3. The link opens the website at `FRONTEND_URL/verify-email?token=...`. The page removes the token from the address bar and
   sends it with **POST** `/api/auth/verify-email` (never GET, so mail scanners that open links cannot verify anyone).
4. The backend checks the token (exists, not used, not expired), sets `email_verified_at`, marks the token used and writes an
   `EMAIL_VERIFIED` audit row. The page then sends the patient to sign in.
5. Until then, a correct email + password answers **403** "Please verify your email address before signing in…".
   (A wrong password still answers 401, so the account state is only shown to someone who knows the password.)

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | Now returns `email_verified: false` and `verification_email_sent`; no session is created. Limit: 20/hour/IP. |
| POST | `/api/auth/verify-email` | Body `{ "token": "..." }`. 200 verified · 400 invalid · 409 already used · 410 expired. Limit: 30/hour/IP. |
| POST | `/api/auth/resend-verification` | Body `{ "email": "..." }`. Always 200 with the same text. Limit: 5/hour per IP+address, plus a 60 s wait per account. |
| POST | `/api/auth/login` | Unverified patients get 403. Everyone else unchanged. |

## Database

Migration `database/migrations/012_email_verification.sql` (run `npm run db:migrate`):

* `users.email_verified_at DATETIME NULL` — the verified flag (a separate boolean would duplicate it).
* Existing users are marked verified by the migration, so nobody is locked out.
* `email_verifications (id, user_id, token_hash CHAR(64) UNIQUE, expires_at, used_at, created_at)`, foreign key to `users` with `ON DELETE CASCADE`.

A new link deletes the user's earlier unused links, so only one is ever active.

## Settings (backend/.env — never committed)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASS=<your 16-character Gmail App Password>
SMTP_FROM_NAME=MedSync
SMTP_FROM_EMAIL=your-address@gmail.com
FRONTEND_URL=http://localhost:5173
```

`backend/.env.example` shows the same names with placeholders only. The password is read only from the environment,
is never logged, and is removed from any error text before it is shown.

Check the settings without sending an email:

```
cd backend
npm run smtp:check
```

## Testing it by hand

1. Put the settings above in `backend/.env`, run `npm run db:migrate`, start the backend and the frontend.
2. Register a new patient with an address you can read.
3. Try to sign in: you get the "verify your email" message and a resend button.
4. Open the email, click **Verify Email**, then sign in.

Automated tests (`npm test`) use a mocked mailer and never send real email.
