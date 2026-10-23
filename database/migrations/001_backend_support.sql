-- ============================================================
-- MedSync migration 001 - columns and tables the backend needs
-- Run ONCE, in this order: database/schema/*.sql -> database/seeds/*.sql -> this file.
-- (the seed rows are written for the old reminders layout; this file converts them).
-- ============================================================
USE medsync;

-- 1. Users can be deactivated instead of deleted
ALTER TABLE users
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

-- 2. Medicines: reorder threshold for low-stock detection, soft delete
ALTER TABLE medicines
    ADD COLUMN reorder_level INT NOT NULL DEFAULT 20,
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
    ADD CONSTRAINT chk_medicine_reorder CHECK (reorder_level >= 0);
CREATE INDEX ix_medicines_name ON medicines (name);
CREATE INDEX ix_medicines_generic ON medicines (generic_name);

-- 3. Prescriptions: lifecycle status (a prescription is cancelled, never deleted)
ALTER TABLE prescriptions
    ADD COLUMN status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX ix_prescriptions_patient ON prescriptions (patient_id, prescription_date);
CREATE INDEX ix_prescriptions_doctor ON prescriptions (doctor_id, prescription_date);

-- 4. Prescription items: a number the scheduler can use (frequency text stays for display)
ALTER TABLE prescription_items
    ADD COLUMN frequency_per_day TINYINT NOT NULL DEFAULT 1,
    ADD CONSTRAINT chk_item_frequency CHECK (frequency_per_day BETWEEN 1 AND 6);
UPDATE prescription_items SET frequency_per_day = CASE
    WHEN LOWER(frequency) LIKE '%twice%'  THEN 2
    WHEN LOWER(frequency) LIKE '%thrice%' OR LOWER(frequency) LIKE '%three%' THEN 3
    ELSE 1 END
WHERE prescription_item_id > 0;  -- (the WHERE keeps MySQL Workbench safe-update mode happy)

-- 5. Reminders: one row per dose (date + time) with Pending / Taken / Skipped
ALTER TABLE reminders
    ADD COLUMN scheduled_at DATETIME NULL,
    ADD COLUMN status_updated_at DATETIME NULL,
    MODIFY COLUMN status ENUM('ACTIVE','COMPLETED','DISMISSED','PENDING','TAKEN','SKIPPED')
        NOT NULL DEFAULT 'PENDING';
UPDATE reminders r
    JOIN prescription_items i ON i.prescription_item_id = r.prescription_item_id
    SET r.scheduled_at = TIMESTAMP(i.start_date, r.reminder_time),
        r.status = CASE r.status WHEN 'COMPLETED' THEN 'TAKEN'
                                 WHEN 'DISMISSED' THEN 'SKIPPED'
                                 ELSE 'PENDING' END
    WHERE r.reminder_id > 0;
ALTER TABLE reminders
    DROP COLUMN reminder_time,
    MODIFY COLUMN scheduled_at DATETIME NOT NULL,
    MODIFY COLUMN status ENUM('PENDING','TAKEN','SKIPPED') NOT NULL DEFAULT 'PENDING',
    ADD CONSTRAINT uq_reminder_slot UNIQUE (prescription_item_id, scheduled_at);
CREATE INDEX ix_reminders_status_time ON reminders (status, scheduled_at);

-- 6. Stock can never be negative
ALTER TABLE medicine_batches
    ADD CONSTRAINT chk_batch_quantity CHECK (quantity >= 0);
CREATE INDEX ix_batches_expiry ON medicine_batches (pharmacy_id, expiry_date);

-- 7. Audit trail (append-only by convention: the app only ever INSERTs)
CREATE TABLE audit_logs (
    audit_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NULL,
    action      VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id   INT NULL,
    details     TEXT,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX ix_audit_time ON audit_logs (created_at);
