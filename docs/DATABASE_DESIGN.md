# MedSync: database design (RDBMS submission)

Engine: MySQL 8 (Azure Database for MySQL in the deployed version). Files: `database/schema/01_all.sql`, `database/seeds/01_all.sql`, `database/migrations/` (numbered, run in order), `database/queries.sql`. ER diagram: `docs/er-diagram.png` (source `docs/er.mmd`).

![ER diagram](er-diagram.png)

## 1. Tables (20, all related)

| Group | Tables |
|---|---|
| People | `users`, `doctors`, `patients`, `pharmacies`, `pharmacy_staff` |
| Medicines and stock | `medicines`, `medicine_interactions`, `medicine_batches`, `dispensed_items` |
| Care | `prescriptions`, `prescription_items`, `prescription_attachments`, `prescription_templates`, `prescription_template_items`, `reminders`, `appointments` |
| System | `notifications`, `audit_logs`, `refresh_tokens`, `throttle_attempts` |

Every table has an integer primary key. The core foreign keys use `ON UPDATE CASCADE ON DELETE RESTRICT`, so a doctor, patient, medicine or batch that is referenced can never be deleted by accident (the log and token tables use their own delete rules). Other constraints: `UNIQUE` on `users.email` and `doctors.license_number`, `NOT NULL` on required columns, `ENUM` on every status column.

## 2. Third normal form

- **1NF:** every column holds one value. There are no repeating groups: a prescription's medicines are rows in `prescription_items`, not a list inside `prescriptions`.
- **2NF:** every table has a single-column key, so no column can depend on part of a key.
- **3NF:** non-key columns depend only on the key.
  - A doctor's name lives in `users`, not copied into `prescriptions`. `doctors` and `patients` hold only role-specific facts (licence, date of birth).
  - Medicine facts (name, strength) live in `medicines`; `prescription_items` stores only what is specific to the prescription (dosage, frequency, dates).
  - Pharmacy stock is `medicine_batches`; what was handed out is `dispensed_items`, so quantities are not stored twice.
  - A medicine interaction is one row per pair in `medicine_interactions`.
- **Deliberate exceptions** (written down, as 3NF asks):
  - `prescriptions.dispensed_at/dispensed_by/dispensed_pharmacy_id` repeat what `dispensed_items` could show. They make "is this prescription filled, and by whom" a single-row read, and they are written in the same transaction as `dispensed_items`.
  - `prescription_items.frequency_per_day` is a number derived from the text in `frequency`. The reminder generator needs the number, and it is validated when the row is created.

## 3. Database objects

| Requirement | Object | Where |
|---|---|---|
| Joins | 4-table inner join, left joins, aggregate joins | `database/queries.sql` (1, 2, 3, 10) |
| View | `v_prescription_summary`, `v_pharmacy_stock`, `v_patient_adherence` | migration 010 |
| Trigger | `trg_batch_no_negative_insert`, `trg_batch_no_negative_update`: stock can never be negative | migration 010 |
| Stored procedure | `sp_expiring_batches(pharmacy_id, days)` | migration 010 |
| Transaction | Dispensing: lock the batch rows (`SELECT ... FOR UPDATE`), reduce stock, write `dispensed_items`, mark the prescription filled, or roll everything back. Booking an appointment locks the doctor's slot the same way. | `pharmacyService.js`, `appointmentService.js`; demo in `queries.sql` (8) |
| Indexes on searched columns | `ix_medicines_name`, `ix_medicines_generic` (search), `ix_prescriptions_patient`, `ix_prescriptions_doctor` (lists, newest first), `ix_reminders_status_time` (reminder job), `ix_batches_expiry` (expiry reports), `ix_audit_entity`, `ix_audit_time`, `ix_notif_user_time` | migrations 001-009 |

`EXPLAIN` on the doctor's prescription list shows `key = ix_prescriptions_doctor` (query 11 in `queries.sql`).

## 4. Running it

```bash
npm run db:migrate -- --seed        # schema, sample data, then migrations 001-011
mysql -u <user> -p medsync < database/queries.sql
```

On Azure Database for MySQL, creating triggers can fail with error 1419 (needs SUPER) when `log_bin_trust_function_creators` is OFF. If migration 010 fails with that error, set the server parameter `log_bin_trust_function_creators` to ON (Server parameters in the portal) and run `npm run db:migrate` again.
