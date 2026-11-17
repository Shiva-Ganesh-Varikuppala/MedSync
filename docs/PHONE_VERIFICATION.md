# Phone number verification (optional)

Any signed-in user can confirm a phone number from **My profile → Phone verification**. Nobody is blocked if they skip it.

## Flow

1. The user enters a number (or uses the one on the profile) and presses **Send code**.
2. The server normalises it (`98765 43210` → `+919876543210`, using `DEFAULT_COUNTRY_CODE`), creates a random 6-digit code and sends it by SMS (Twilio).
3. The user types the code. If it is right, `users.phone` is set to that number and `users.phone_verified_at` is set.
4. Saving a *different* number on the profile clears the verified state. The same number written another way (spaces, `+91`) stays verified.

## Rules

* The code is valid 10 minutes, works once, and allows 5 wrong tries.
* One new code a minute per user; at most 5 codes and 30 checks an hour (`PHONE_SEND_MAX_PER_HOUR`, `PHONE_VERIFY_MAX_PER_HOUR`, `PHONE_CODE_COOLDOWN_SECONDS`).
* Only an HMAC-SHA256 of the code is stored (keyed with `JWT_SECRET`); the code is never returned by the API and never logged by the SMS sender.
* **Development fallback:** when Twilio is not set up and `NODE_ENV` is not `production`, the code is printed in the *backend terminal* only (and the profile page says so). In production the request is refused with 503.

## Endpoints (sign-in required)

| Method | Path | Body | Answers |
|---|---|---|---|
| POST | `/api/auth/phone/send-code` | `{ "phone": "+91 98765 43210" }` (optional) | 200 sent · 400 bad/missing number · 429 too soon · 502/503 SMS problem |
| POST | `/api/auth/phone/verify` | `{ "code": "123456" }` | 200 verified · 400 wrong/none · 410 expired · 429 too many tries |

`GET /api/auth/me` now includes `phone_verified`.

## Database

`database/migrations/015_phone_verification.sql` (run `npm run db:migrate`): `users.phone_verified_at` and the table `phone_verifications`.

## Settings

Real SMS uses the existing Twilio settings in `backend/.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. A Twilio trial account can only text numbers you have verified in the Twilio console. Messages to Indian numbers may also need DLT registration for a paid account.

Reminder SMS are **not** restricted to verified numbers (so existing reminders keep working).
