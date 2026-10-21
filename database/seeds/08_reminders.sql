USE medsync;

-- ============================================
-- MEDICINE REMINDERS
-- Development / demonstration data
-- ============================================

INSERT INTO reminders
    (prescription_item_id, reminder_time, status)
VALUES
    (1, '08:00:00', 'ACTIVE'),
    (1, '20:00:00', 'ACTIVE'),
    (2, '22:00:00', 'ACTIVE');