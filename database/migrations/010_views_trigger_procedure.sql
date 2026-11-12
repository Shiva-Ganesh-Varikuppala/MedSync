-- 010: reporting views, a stock-safety trigger and a stored procedure.
-- Used by the RDBMS part of the project (view + trigger + stored procedure) and the analytics screen.
-- Safe to run twice: every object is dropped and created again.

-- 1. VIEW: one row per prescription, with doctor, patient and the medicines on it.
DROP VIEW IF EXISTS v_prescription_summary;
CREATE VIEW v_prescription_summary AS
SELECT p.prescription_id,
       p.prescription_date,
       p.status,
       du.name              AS doctor_name,
       d.specialization,
       pu.name              AS patient_name,
       COUNT(pi.prescription_item_id) AS item_count,
       GROUP_CONCAT(DISTINCT m.name ORDER BY m.name SEPARATOR ', ') AS medicines
FROM prescriptions p
JOIN doctors  d  ON d.doctor_id  = p.doctor_id
JOIN users    du ON du.user_id   = d.user_id
JOIN patients pt ON pt.patient_id = p.patient_id
JOIN users    pu ON pu.user_id   = pt.user_id
LEFT JOIN prescription_items pi ON pi.prescription_id = p.prescription_id
LEFT JOIN medicines m           ON m.medicine_id = pi.medicine_id
GROUP BY p.prescription_id, p.prescription_date, p.status, du.name, d.specialization, pu.name;

-- 2. VIEW: stock that can actually be dispensed today (not deleted, not expired), per pharmacy and medicine.
DROP VIEW IF EXISTS v_pharmacy_stock;
CREATE VIEW v_pharmacy_stock AS
SELECT ph.pharmacy_id,
       ph.name               AS pharmacy_name,
       m.medicine_id,
       m.name                AS medicine_name,
       SUM(b.quantity)       AS units_in_stock,
       COUNT(b.batch_id)     AS batch_count,
       MIN(b.expiry_date)    AS nearest_expiry
FROM medicine_batches b
JOIN pharmacies ph ON ph.pharmacy_id = b.pharmacy_id
JOIN medicines  m  ON m.medicine_id  = b.medicine_id
WHERE b.deleted_at IS NULL AND b.expiry_date >= CURDATE()
GROUP BY ph.pharmacy_id, ph.name, m.medicine_id, m.name;

-- 3. VIEW (analytics): how well each patient follows their reminders.
-- adherence_pct = taken / (taken + skipped + missed); reminders still PENDING are not counted.
DROP VIEW IF EXISTS v_patient_adherence;
CREATE VIEW v_patient_adherence AS
SELECT pt.patient_id,
       u.name AS patient_name,
       SUM(r.status = 'TAKEN')   AS taken,
       SUM(r.status = 'SKIPPED') AS skipped,
       SUM(r.status = 'MISSED')  AS missed,
       SUM(r.status = 'PENDING') AS pending,
       ROUND(100 * SUM(r.status = 'TAKEN') / NULLIF(SUM(r.status IN ('TAKEN','SKIPPED','MISSED')), 0), 1) AS adherence_pct
FROM reminders r
JOIN prescription_items pi ON pi.prescription_item_id = r.prescription_item_id
JOIN prescriptions p       ON p.prescription_id = pi.prescription_id
JOIN patients pt           ON pt.patient_id = p.patient_id
JOIN users u               ON u.user_id = pt.user_id
GROUP BY pt.patient_id, u.name;

-- 4. TRIGGERS: stock can never go negative, even if a bug or a hand-written query tries it.
DROP TRIGGER IF EXISTS trg_batch_no_negative_insert;
DROP TRIGGER IF EXISTS trg_batch_no_negative_update;

CREATE TRIGGER trg_batch_no_negative_insert BEFORE INSERT ON medicine_batches
FOR EACH ROW
BEGIN
    IF NEW.quantity < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Batch quantity cannot be negative';
    END IF;
END;

CREATE TRIGGER trg_batch_no_negative_update BEFORE UPDATE ON medicine_batches
FOR EACH ROW
BEGIN
    IF NEW.quantity < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Batch quantity cannot be negative';
    END IF;
END;

-- 5. STORED PROCEDURE: batches of one pharmacy that expire within the next N days (soonest first).
DROP PROCEDURE IF EXISTS sp_expiring_batches;
CREATE PROCEDURE sp_expiring_batches(IN p_pharmacy_id INT, IN p_days INT)
BEGIN
    SELECT b.batch_id, m.name AS medicine_name, b.batch_number, b.quantity, b.expiry_date,
           DATEDIFF(b.expiry_date, CURDATE()) AS days_left
    FROM medicine_batches b
    JOIN medicines m ON m.medicine_id = b.medicine_id
    WHERE b.pharmacy_id = p_pharmacy_id
      AND b.deleted_at IS NULL
      AND b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL p_days DAY)
    ORDER BY b.expiry_date, b.batch_id;
END;
