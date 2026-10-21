USE medsync;

-- ============================================
-- PRESCRIPTION ITEMS
-- ============================================

INSERT INTO prescription_items
    (
        prescription_id,
        medicine_id,
        dosage,
        frequency,
        start_date,
        end_date,
        instructions
    )
VALUES
    (
        1,
        1,
        '500 mg',
        'Twice daily',
        '2026-10-21',
        '2026-10-25',
        'Take after food.'
    ),
    (
        1,
        5,
        '10 mg',
        'Once daily',
        '2026-10-21',
        '2026-10-25',
        'Take at night.'
    );