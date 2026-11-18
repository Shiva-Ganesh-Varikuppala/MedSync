# MedSync — Free Demo Deployment Guide

> **Branch:** `deploy/demo-no-db` | **Stack:** Node.js (Render) + React/Vite (Vercel)

This guide walks you through deploying the MedSync **demo mode** — a fully functional frontend backed by a lightweight API that requires **no database**. It is intended for showcasing the UI and API surface to stakeholders without the operational overhead of managing a MySQL instance.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Backend Deployment on Render](#3-backend-deployment-on-render)
4. [Frontend Deployment on Vercel](#4-frontend-deployment-on-vercel)
5. [Post-Deployment CORS Configuration](#5-post-deployment-cors-configuration)
6. [Verification Steps](#6-verification-steps)
7. [Free-Tier Limitations](#7-free-tier-limitations)
8. [Disabling Demo Mode Later](#8-disabling-demo-mode-later)
9. [Reconnecting MySQL](#9-reconnecting-mysql)
10. [Security Notes](#10-security-notes)

---

## 1. Overview

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet / Browser                    │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTPS
           ┌───────────────▼──────────────┐
           │        Vercel (Hobby)         │
           │   React + Vite SPA frontend  │
           │   Branch: deploy/demo-no-db  │
           │   Root dir: frontend/        │
           └───────────────┬──────────────┘
                           │  HTTPS  (VITE_API_URL)
           ┌───────────────▼──────────────┐
           │        Render (Free)          │
           │   Node.js / Express backend  │
           │   Branch: deploy/demo-no-db  │
           │   Root dir: backend/         │
           │   DEMO_MODE=true             │
           │   ✗ No MySQL connection      │
           └──────────────────────────────┘
```

### Purpose of Demo Mode

When `DEMO_MODE=true`, the backend starts **without** connecting to a MySQL database:

- `/api/health` returns `200 OK` with `"mode": "demo"`.
- All other `/api/*` routes return `503 Service Unavailable` with a human-readable explanation.
- The frontend loads, renders, and can be navigated end-to-end.
- No patient data is stored or processed.

This lets you share a live, publicly accessible URL for UI review without provisioning a database.

---

## 2. Prerequisites

Before you start, make sure you have free accounts on the following platforms:

| Platform | Purpose | Sign-up URL |
|---|---|---|
| **GitHub** | Source repository hosting | https://github.com |
| **Render** | Backend (Node.js) hosting | https://render.com |
| **Vercel** | Frontend (React/Vite) hosting | https://vercel.com |

You also need:
- The MedSync repository forked/pushed to **your own GitHub account** (Render and Vercel pull from GitHub).
- The `deploy/demo-no-db` branch pushed to that repository.

> [!IMPORTANT]
> Both Render and Vercel need **read access to your GitHub repository**. Grant this during their OAuth flow when you first connect.

---

## 3. Backend Deployment on Render

### 3.1 Create a New Web Service

1. Log in to [render.com](https://render.com) and click **New +** → **Web Service**.
2. Choose **Build and deploy from a Git repository** and click **Next**.
3. Connect your GitHub account if prompted, then search for and select your MedSync repository.

### 3.2 Configure the Service

Fill in the following fields on the configuration screen:

| Field | Value |
|---|---|
| **Name** | `medsync-demo-backend` _(or any name you prefer)_ |
| **Region** | Closest to your users |
| **Branch** | `deploy/demo-no-db` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

### 3.3 Set Environment Variables

Scroll down to the **Environment Variables** section and add the following key-value pairs:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` |
| `JWT_SECRET` | _(click **Generate** — Render will produce a secure random value; minimum 32 characters)_ |
| `CORS_ORIGIN` | _(leave **blank** for now — you will fill this in after Vercel deploys)_ |

> [!WARNING]
> Do **not** use a weak or guessable `JWT_SECRET`. Always use the **Generate** button or supply a cryptographically random string of at least 32 characters. Never reuse secrets across environments.

### 3.4 Set the Health Check Path

In the **Advanced** section, set:

| Field | Value |
|---|---|
| **Health Check Path** | `/api/health` |

### 3.5 Deploy

Click **Create Web Service**. Render will clone the repository, run `npm install`, and start the server. The first build typically takes 2–4 minutes.

Watch the **Logs** tab. A successful start looks like:

```
🟡 DEMO_MODE=true — starting without MySQL database
MedSync demo backend running on port 10000
```

### 3.6 Note Your Render URL

Once the service is live, Render shows a URL in the format:

```
https://medsync-demo-backend.onrender.com
```

Copy this URL — you will need it for the frontend environment variable.

### 3.7 Test the Health Endpoint

```bash
curl -s https://medsync-demo-backend.onrender.com/api/health | jq .
```

Expected response:

```json
{
  "success": true,
  "message": "MedSync demo API is healthy",
  "database": "disabled",
  "mode": "demo"
}
```

> [!NOTE]
> If `jq` is not installed, omit `| jq .` — you will still see the raw JSON.

---

## 4. Frontend Deployment on Vercel

### 4.1 Import the Project

1. Log in to [vercel.com](https://vercel.com) and click **Add New…** → **Project**.
2. Select **Import Git Repository** and choose your MedSync repository.

### 4.2 Configure the Project

| Field | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Branch** | `deploy/demo-no-db` |

> [!NOTE]
> Click **Edit** next to Root Directory if Vercel doesn't auto-detect it. You may also need to expand **Build & Output Settings** to override the build/output fields.

### 4.3 Set Environment Variables

Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://medsync-demo-backend.onrender.com` _(your actual Render URL from step 3.6)_ |

> [!IMPORTANT]
> The `VITE_` prefix is required. Vite only exposes variables prefixed with `VITE_` to the browser bundle. Without this prefix, the variable will be `undefined` at runtime.

### 4.4 Deploy

Click **Deploy**. Vercel runs `npm install` and `npm run build`. Build time is typically under 60 seconds.

### 4.5 Note Your Vercel URL

After a successful deploy, Vercel shows a URL in the format:

```
https://medsync-demo.vercel.app
```

Copy this URL — you need it for the CORS step next.

---

## 5. Post-Deployment CORS Configuration

The backend rejects cross-origin requests unless `CORS_ORIGIN` is set to the frontend's exact origin.

### Steps

1. In the Render dashboard, open your **medsync-demo-backend** service.
2. Go to **Environment** → find `CORS_ORIGIN`.
3. Set its value to your Vercel URL **exactly as shown** (no trailing slash):

```
https://medsync-demo.vercel.app
```

4. Click **Save Changes**.
5. Render will automatically **redeploy** the service with the new variable.

> [!WARNING]
> Include the protocol (`https://`) but **no trailing slash**. A mismatch (e.g. `https://medsync-demo.vercel.app/`) will cause CORS errors on every API call.

Wait for the redeploy to complete (watch the Render logs), then proceed to verification.

---

## 6. Verification Steps

Run through these checks after both services are live and CORS is configured.

### 6.1 Backend Health Check

```bash
curl -s https://medsync-demo-backend.onrender.com/api/health
```

✅ Expected: `{"success":true,"mode":"demo","database":"disabled",...}`

### 6.2 CORS Pre-flight Check

```bash
curl -s -I \
  -H "Origin: https://medsync-demo.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  https://medsync-demo-backend.onrender.com/api/health
```

✅ Expected: response includes `Access-Control-Allow-Origin: https://medsync-demo.vercel.app`

### 6.3 Demo Route Returns 503

```bash
curl -s https://medsync-demo-backend.onrender.com/api/appointments
```

✅ Expected: HTTP 503 with `{"mode":"demo","available":false,...}`

### 6.4 Frontend Loads in Browser

1. Open `https://medsync-demo.vercel.app` in a browser.
2. The app should load without a blank white screen or console errors about CORS.
3. Open DevTools → **Network** tab, filter by `Fetch/XHR`.
4. Any API request to `/api/health` should return 200.

### 6.5 SPA Routing

Navigate directly to a deep link (e.g. `https://medsync-demo.vercel.app/dashboard`). You should see the app — not a 404. This confirms `frontend/vercel.json` rewrites are working.

---

## 7. Free-Tier Limitations

> [!CAUTION]
> Both platforms impose strict limits on free tiers. Exceeding them will cause service interruption or charges.

### Render Free Tier

| Limitation | Detail |
|---|---|
| **Cold starts** | The service **sleeps after 15 minutes of inactivity**. The first request after a sleep period can take **50+ seconds** to respond while the container spins up. |
| **Compute** | 0.1 CPU / 512 MB RAM shared — not suitable for load. |
| **Uptime** | No SLA; free instances may be restarted at any time. |
| **Bandwidth** | 100 GB/month outbound. |

### Vercel Hobby Tier

| Limitation | Detail |
|---|---|
| **Bandwidth** | 100 GB / month. |
| **Builds** | 100 deployments / day. |
| **Commercial use** | ❌ Vercel Hobby is **not licensed for commercial use**. |
| **Team features** | Not available on Hobby. |

> [!CAUTION]
> **This demo is NOT suitable for production healthcare use.** It runs without a database, without audit logging, and on infrastructure with no uptime guarantees. Never use it to store, transmit, or process real patient data.

---

## 8. Disabling Demo Mode Later

When you are ready to transition from demo to a real deployment (with a database):

1. In the Render dashboard, open your service → **Environment**.
2. Change `DEMO_MODE` from `true` to `false`.
3. Add the MySQL connection variables (see [Section 9](#9-reconnecting-mysql)).
4. Click **Save Changes** — Render redeploys automatically.

The backend will now attempt a real MySQL connection on startup. If the database is unreachable, the server will exit with an error — this is intentional.

---

## 9. Reconnecting MySQL

Add the following environment variables to your Render service (under **Environment**):

| Variable | Example Value | Description |
|---|---|---|
| `DB_HOST` | `db.example.com` | Hostname of your MySQL server |
| `DB_PORT` | `3306` | MySQL port (default: 3306) |
| `DB_USER` | `medsync_user` | Database username |
| `DB_PASSWORD` | `s3cur3P@ssw0rd` | Database password |
| `DB_NAME` | `medsync_production` | Database/schema name |
| `DB_SSL` | `true` | Enable SSL for DB connection (`true` / `false`) |
| `DB_TIMEZONE` | `+00:00` | MySQL timezone offset (UTC recommended) |

Then **remove** the `DEMO_MODE` variable (or set it to `false`).

```
DEMO_MODE  →  delete this row (or set to false)
```

> [!TIP]
> Use a managed MySQL service such as **PlanetScale**, **Railway**, or **AWS RDS** for a production database. Make sure the service allows inbound connections from Render's IP ranges, or use a connection pooler.

After saving, monitor the Render logs. A successful connection looks like:

```
✅ MySQL database connected successfully
MedSync backend running on port 10000
⏰ Background cron worker started
```

---

## 10. Security Notes

> [!IMPORTANT]
> Read these notes carefully before sharing the demo URL publicly.

- **No real patient data.** Demo mode returns 503 for all data-mutating endpoints. No PHI is stored or transmitted.
- **JWT is still enforced in production mode.** When `DEMO_MODE=false`, all protected routes require a valid `Authorization: Bearer <token>` header signed with `JWT_SECRET`.
- **`JWT_SECRET` must remain secret.** Never commit it to source control. Never share it in Slack or email. Rotate it immediately if it is ever exposed.
- **CORS is intentionally restrictive.** Only the origin set in `CORS_ORIGIN` is allowed. Do not set `CORS_ORIGIN=*` in any environment.
- **HTTPS everywhere.** Both Render and Vercel provide TLS by default. Never downgrade to HTTP.
- **This demo branch is not HIPAA-compliant.** It is not suitable for handling protected health information (PHI). A production deployment requires a full security review, audit logging, encryption at rest, and appropriate Business Associate Agreements (BAA) with all vendors.
- **Rotate secrets before going live.** Generate a new `JWT_SECRET` for every environment (dev, staging, production).

---

*Last updated: November 2026 — MedSync deploy/demo-no-db branch*
