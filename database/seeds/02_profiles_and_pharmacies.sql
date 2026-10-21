USE medsync;

-- ============================================
-- DOCTORS
-- ============================================

INSERT INTO doctors
    (user_id, license_number, specialization)
VALUES
    (1, 'MED-DOC-1001', 'General Medicine'),
    (2, 'MED-DOC-1002', 'Cardiology');


-- ============================================
-- PATIENTS
-- ============================================

INSERT INTO patients
    (user_id, date_of_birth, gender, address)
VALUES
    (3, '2005-04-12', 'Male', 'Hyderabad, Telangana'),
    (4, '2004-11-23', 'Female', 'Hyderabad, Telangana'),
    (5, '2005-07-08', 'Male', 'Warangal, Telangana');


-- ============================================
-- PHARMACIES
-- ============================================

INSERT INTO pharmacies
    (name, address, phone, email)
VALUES
    (
        'MedCare Pharmacy',
        'Banjara Hills, Hyderabad, Telangana',
        '9876510001',
        'contact@medcare.dev'
    ),
    (
        'HealthPlus Pharmacy',
        'Madhapur, Hyderabad, Telangana',
        '9876510002',
        'contact@healthplus.dev'
    );


-- ============================================
-- PHARMACY STAFF
-- ============================================

INSERT INTO pharmacy_staff
    (user_id, pharmacy_id)
VALUES
    (6, 1),
    (7, 2);