-- ============================================================
-- MedSync migration 003 - password change support
-- Run AFTER 002_admin_role.sql.
-- Remembers when a password was last changed, so tokens issued before
-- that moment stop working (changing a password signs out other sessions).
-- ============================================================
USE medsync;

ALTER TABLE users
    ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL;
