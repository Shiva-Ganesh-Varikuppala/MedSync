USE medsync;

-- ============================================
-- MEDICINE BATCHES / PHARMACY STOCK
-- Development data
-- ============================================

INSERT INTO medicine_batches
    (medicine_id, pharmacy_id, batch_number, quantity, expiry_date)
VALUES
    -- MedCare Pharmacy
    (1, 1, 'MC-PAR-001', 100, '2027-03-31'),
    (1, 1, 'MC-PAR-002', 50,  '2027-08-31'),
    (2, 1, 'MC-AMX-001', 75,  '2027-02-28'),
    (5, 1, 'MC-CET-001', 120, '2027-05-31'),
    (6, 1, 'MC-OMP-001', 80,  '2027-09-30'),

    -- HealthPlus Pharmacy
    (1, 2, 'HP-PAR-001', 90,  '2027-04-30'),
    (3, 2, 'HP-IBU-001', 60,  '2027-06-30'),
    (4, 2, 'HP-AZI-001', 40,  '2027-01-31'),
    (7, 2, 'HP-MET-001', 100, '2027-07-31'),
    (8, 2, 'HP-AML-001', 70,  '2027-10-31');