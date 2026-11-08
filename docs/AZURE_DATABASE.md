# Moving the MedSync database to Azure

**Use: Azure Database for MySQL.** MedSync already speaks MySQL, so the app code stays the same. Only the connection settings change.

Notes:
- *Azure SQL Database*, *Azure Database for PostgreSQL* and *Azure Cosmos DB* are also on Azure's list, but they are not MySQL, so they would mean rewriting the backend.
- In the Azure portal, Azure Database for MySQL is created with the deployment option named **Flexible server**. Use that one. The older "Single server" option is retired.

## 1. Before you start

- An Azure account: either the **Azure free account** or **Azure for Students** (a student email may give free credit without a card). Check the current offer on Azure's own pages, because free allowances change. The free account has included a small "Burstable B1ms" MySQL server for 12 months.
- Your backend can stay on your laptop. Only the database moves to Azure.
- Know your public IP address (search "what is my IP"). Azure blocks every IP that is not on its allow list.

## 2. Create the server (Azure portal)

1. Portal → **Create a resource** → search **Azure Database for MySQL** → **Create** → choose the **Flexible server** deployment option.
2. **Basics:**
   - Resource group: **Create new** → `medsync-rg`.
   - Server name: something unique, e.g. `medsync-shiva`. Your host will be `medsync-shiva.mysql.database.azure.com`.
   - Region: the nearest one (for India, *Central India* or *South India*).
   - MySQL version: **8.0**.
   - Workload type: **Development or hobby project** (cheapest). Compute: **Burstable, Standard_B1ms**. Storage: 20 GiB is plenty.
   - Authentication: **MySQL authentication only**. Admin username `medsyncadmin`, and a strong password. Save it somewhere safe.
3. **Networking:** choose **Public access**. Tick **Add current client IP address**. Do not tick "Allow public access from any Azure service" unless you later host the backend on Azure too. You cannot switch between public and private access after creation.
4. **Review + create** → **Create**. It takes a few minutes.

## 3. Connect MedSync to it

Edit `backend/.env`:

```env
DB_HOST=medsync-shiva.mysql.database.azure.com
DB_PORT=3306
DB_USER=medsyncadmin
DB_PASSWORD=the-password-you-chose
DB_NAME=medsync
DB_SSL=true
DB_TIMEZONE=+05:30
```

- `DB_SSL=true` is required: Azure only accepts encrypted connections.
- `DB_TIMEZONE=+05:30` makes dates, reminders and expiry checks follow India time. Azure servers run in UTC.

## 4. Create the tables

From the `backend` folder:

```bash
npm install
npm run db:migrate -- --seed
```

- This creates the `medsync` database if it is missing, loads the schema, the sample data and every migration, and remembers what it applied. Running it again only applies new files.
- If you want an empty database with no demo users, leave out `-- --seed` (you will then need to create an administrator yourself).

## 5. Give the accounts real passwords

The seed data has placeholder password hashes, so nobody can sign in yet. Choose one:

- **For a demo:** `npm run dev:passwords` sets every account's password to `Test@12345`. (It refuses to run if `NODE_ENV=production`.)
- **For real use**, one account at a time:
  ```bash
  NEW_PASSWORD='Your@Strong1Pass' npm run db:set-password -- admin@medsync.dev
  ```

Then start the app as usual (`npm run dev`) and sign in. `http://localhost:5001/api/health` should report the database as connected.

## 6. Copy your existing local data instead (optional)

If you already have data in your local MySQL that you want on Azure:

```bash
# 1. export from your computer
mysqldump -u YOUR_LOCAL_USER -p --no-tablespaces --single-transaction medsync > medsync.sql

# 2. create an empty database on Azure
mysql -h medsync-shiva.mysql.database.azure.com -u medsyncadmin -p --ssl-mode=REQUIRED -e "CREATE DATABASE medsync"

# 3. import
mysql -h medsync-shiva.mysql.database.azure.com -u medsyncadmin -p --ssl-mode=REQUIRED medsync < medsync.sql

# 4. tell the migration runner everything is already applied
cd backend && npm run db:migrate -- --baseline
```

## 7. Keep tests on a local database

`npm test` creates and **drops** a database named `<DB_NAME>_test`. Run the tests with a local MySQL (a different `.env`, or set `DB_HOST`, `DB_PORT` and the other values for that one command), not against Azure.

## 8. Costs and tidy-up

- A running server is billed even when nobody uses it. In the portal, **Stop** the server when you are not using it (storage is still billed, and Azure restarts a stopped server automatically after some days).
- When you are done for good, delete the **resource group** `medsync-rg`. That removes the server and everything attached, so no bill remains.
- Set a **budget alert** (Cost Management → Budgets) so a forgotten server cannot surprise you.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `ETIMEDOUT`, `ECONNREFUSED`, or "Can't connect ... (115)" | Your IP is not allowed. Server → **Networking** → add your current IP. Home and college Wi-Fi change your IP, so re-add it. Also check that your network allows outgoing port 3306. |
| `Access denied for user` | Wrong user or password. Use only the admin name (`medsyncadmin`), not `name@server`. Reset the password in the portal if needed. |
| `HANDSHAKE_SSL_ERROR`, "self-signed certificate" | Download the Azure CA certificates (DigiCert Global Root G2 and Microsoft RSA Root Certificate Authority 2017), put them in one `.pem` file, and set `DB_SSL_CA=/path/to/that.pem`. Never turn certificate checking off for Azure. |
| "Server is not configured to allow ... non-SSL" | `DB_SSL=true` is missing in `.env`. |
| Dates or reminders are 5.5 hours off | `DB_TIMEZONE=+05:30` is missing in `.env`. |
| `npm run db:migrate` says a table already exists | The database was set up by hand earlier. Run `npm run db:migrate -- --baseline` once, then the normal command later. |

## What we verified, and what we did not

- We ran the migration runner, the password script, encrypted connections (strict certificate checking refuses an untrusted server) and the time zone setting, and the full test suite, against a real **MySQL 8.0** server.
- We have **not** run it against a real Azure server yet: the first connection from your own Azure account is the real check. If it fails, send the exact error message.
