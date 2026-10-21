USE medsync;

-- ============================================
-- MEDICINE INTERACTIONS
-- Development / demonstration data only
-- ============================================

INSERT INTO medicine_interactions
    (medicine_id_1, medicine_id_2, severity, description)
VALUES
    (
        1,
        3,
        'MODERATE',
        'Potential interaction between paracetamol and ibuprofen. Review the patient medication profile before concurrent use.'
    ),
    (
        2,
        4,
        'MODERATE',
        'Potential interaction between amoxicillin and azithromycin. Review the complete prescription and patient history.'
    ),
    (
        7,
        8,
        'MODERATE',
        'Potential interaction between metformin and amlodipine. Review the patient medication profile and clinical context.'
    ),
    (
        8,
        9,
        'MILD',
        'Potential interaction between amlodipine and atorvastatin. Review the patient medication profile.'
    );