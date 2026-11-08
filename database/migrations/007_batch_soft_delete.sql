-- ============================================================
-- MedSync migration 007 - removed batches are hidden, not deleted
-- (dispensing history keeps pointing at them)
-- ============================================================
USE medsync;

ALTER TABLE medicine_batches ADD COLUMN deleted_at DATETIME NULL;
CREATE INDEX ix_batches_deleted ON medicine_batches (pharmacy_id, deleted_at);
