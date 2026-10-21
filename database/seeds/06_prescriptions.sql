USE medsync;

-- ============================================
-- PRESCRIPTION
-- ============================================

INSERT INTO prescriptions
    (doctor_id, patient_id, prescription_date, diagnosis, notes)
VALUES
    (
        1,
        1,
        '2026-10-21',
        'Fever and mild respiratory symptoms',
        'Follow the prescribed dosage and complete the prescribed course.'
    );