-- ============================================================
-- MedSync migration 002 - administrator role
-- Run AFTER 001_backend_support.sql.
-- Adds the ADMIN role and one development admin account
-- (admin@medsync.dev). Its password hash is a placeholder:
--   development : run `npm run dev:passwords` (sets Test@12345)
--   real use    : change the password after the first login
-- ============================================================
USE medsync;

ALTER TABLE users
    MODIFY COLUMN role ENUM('DOCTOR','PATIENT','PHARMACY_STAFF','ADMIN') NOT NULL;

INSERT INTO users (name, email, password_hash, role, phone, is_active)
SELECT 'System Admin', 'admin@medsync.dev', '$2b$12$placeholderplaceholderplaceholderplaceholderplaceholde', 'ADMIN', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@medsync.dev');
