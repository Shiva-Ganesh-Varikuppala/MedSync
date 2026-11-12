# MedSync: data classification (DP-900 submission)

## 1. What kind of data MedSync holds

| Kind | Where it lives in MedSync | Examples | Azure service |
|---|---|---|---|
| **Structured** (rows and columns, fixed schema) | MySQL tables | `users`, `prescriptions`, `prescription_items`, `reminders`, `medicine_batches`, `appointments` | Azure Database for MySQL |
| **Semi-structured** (self-describing, no fixed columns) | JSON text inside a column, and the JSON the API sends and receives | `audit_logs.details` (a JSON object that differs per action), every API response (`{success, message, data}`) | Stored in the same MySQL database as JSON text |
| **Unstructured** (files, no schema) | Files in object storage | Scans, lab reports and letters attached to a prescription (PDF, PNG, JPEG) | Azure Blob Storage (non-relational) |

The split follows the rule of thumb from DP-900: if you query it by column, keep it relational; if it is a file you store and fetch whole, keep it in object storage. The database holds only a small record about each file (`prescription_attachments`: name, type, size, the prescription it belongs to, and the blob name); the bytes are in Blob Storage.

## 2. Relational and non-relational stores

- **Relational:** Azure Database for MySQL (server `medsync`, resource group `medsync-rg`). Schema in `database/`, design in `docs/DATABASE_DESIGN.md`.
- **Non-relational:** Azure Blob Storage, a private container (`prescription-files`). Setup in `docs/AZURE_BLOB_STORAGE.md`. Code in `backend/src/services/blobStore.js`. Without a storage account the app keeps files in a local folder, so development needs no Azure.

## 3. Analytics

The admin **Analytics** tab (`GET /api/admin/analytics`) reads the SQL views `v_patient_adherence` and `v_pharmacy_stock` and charts prescriptions per month, reminder outcomes, lowest stock and adherence per patient. Power BI Desktop runs only on Windows; on a Windows machine it can connect to the same MySQL server and use these views directly (get data, MySQL database, then pick the `v_*` views). That connection was not tested for this project.

## 4. Sensitivity

| Data | Sensitivity | Protection |
|---|---|---|
| Diagnoses, prescriptions, medicines, reminders, appointments | **Highly sensitive** (health data) | Role-based access and ownership checks (strangers get 404), TLS to the database, audit log of every write |
| Attached files | **Highly sensitive** | Private container (no public access), only the API reads and writes it, type and content checks, 5 MB limit, access follows the prescription's visibility |
| Name, email, phone, date of birth, address | **Personal data** | Same access rules, hidden from other roles in search results |
| Passwords | **Secret** | bcrypt hashes only, never returned by the API |
| Refresh tokens, connection strings, API keys | **Secret** | Hashed tokens in the database; connection strings only in `.env` (not in git) |
| Medicine catalogue, interactions | Public reference data | No special handling |
| Audit log | Internal | Read by admins only |

## 5. Azure resources to screenshot for the report

1. Resource group `medsync-rg`, showing the MySQL server (and the storage account once created).
2. MySQL server Overview page.
3. MySQL server Networking page, showing the firewall rule.
4. Storage account, Containers page, showing `prescription-files` with **Public access level: Private**.
5. Storage account, Networking page (and the setting that disables anonymous blob access).
6. MySQL Workbench or the `mysql` command showing the tables and the views.
7. The admin Analytics tab in the running app.
