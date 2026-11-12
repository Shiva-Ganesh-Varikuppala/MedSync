-- MedSync: example queries for the RDBMS submission.
-- Run against the seeded database:  mysql -u <user> -p medsync < database/queries.sql
-- (Every query is read-only except section 8, which is wrapped in a transaction and rolled back.)

-- 1. INNER JOIN (4 tables): each prescription with its doctor and patient.
SELECT p.prescription_id, p.prescription_date, du.name AS doctor, pu.name AS patient, p.status
FROM prescriptions p
JOIN doctors  d  ON d.doctor_id   = p.doctor_id
JOIN users    du ON du.user_id    = d.user_id
JOIN patients pt ON pt.patient_id = p.patient_id
JOIN users    pu ON pu.user_id    = pt.user_id
ORDER BY p.prescription_date DESC;

-- 2. JOIN + aggregate: how many prescriptions has each doctor written?
SELECT du.name AS doctor, d.specialization, COUNT(p.prescription_id) AS prescriptions
FROM doctors d
JOIN users du ON du.user_id = d.user_id
LEFT JOIN prescriptions p ON p.doctor_id = d.doctor_id
GROUP BY d.doctor_id, du.name, d.specialization
ORDER BY prescriptions DESC;

-- 3. LEFT JOIN: medicines that have no stock in any pharmacy (never ordered, expired or deleted).
SELECT m.medicine_id, m.name
FROM medicines m
LEFT JOIN v_pharmacy_stock s ON s.medicine_id = m.medicine_id
WHERE s.medicine_id IS NULL;

-- 4. Using a VIEW: what is on each prescription.
SELECT prescription_id, patient_name, doctor_name, item_count, medicines
FROM v_prescription_summary
WHERE status = 'ACTIVE';

-- 5. Using a VIEW: stock that can be dispensed, lowest first.
SELECT pharmacy_name, medicine_name, units_in_stock, nearest_expiry
FROM v_pharmacy_stock
ORDER BY units_in_stock
LIMIT 10;

-- 6. Using a VIEW (analytics): reminder adherence per patient.
SELECT patient_name, taken, skipped, missed, pending, adherence_pct
FROM v_patient_adherence
ORDER BY adherence_pct;

-- 7. Calling the STORED PROCEDURE: batches of pharmacy 1 expiring in the next 120 days.
CALL sp_expiring_batches(1, 120);

-- 8. TRANSACTION: dispense one unit and record it, or change nothing at all.
--    (The application does this in pharmacyService.js with SELECT ... FOR UPDATE; ROLLBACK here keeps the demo harmless.)
START TRANSACTION;
SELECT quantity FROM medicine_batches WHERE batch_id = 1 FOR UPDATE;
UPDATE medicine_batches SET quantity = quantity - 1 WHERE batch_id = 1 AND quantity >= 1;
SELECT batch_id, quantity FROM medicine_batches WHERE batch_id = 1;
ROLLBACK;

-- 9. TRIGGER in action: this fails with "Batch quantity cannot be negative".
-- UPDATE medicine_batches SET quantity = -5 WHERE batch_id = 1;

-- 10. Subquery: patients who were prescribed a SEVERE interacting pair of medicines.
SELECT DISTINCT pu.name AS patient, m1.name AS medicine_a, m2.name AS medicine_b, mi.severity
FROM medicine_interactions mi
JOIN medicines m1 ON m1.medicine_id = mi.medicine_id_1
JOIN medicines m2 ON m2.medicine_id = mi.medicine_id_2
JOIN prescription_items a ON a.medicine_id = mi.medicine_id_1
JOIN prescription_items b ON b.medicine_id = mi.medicine_id_2 AND b.prescription_id = a.prescription_id
JOIN prescriptions p ON p.prescription_id = a.prescription_id
JOIN patients pt ON pt.patient_id = p.patient_id
JOIN users pu ON pu.user_id = pt.user_id
WHERE mi.severity = 'SEVERE';

-- 11. Index check: the lookup the doctor screen runs. EXPLAIN shows ix_prescriptions_doctor in "key".
EXPLAIN SELECT prescription_id, prescription_date FROM prescriptions WHERE doctor_id = 1 ORDER BY prescription_date DESC;
