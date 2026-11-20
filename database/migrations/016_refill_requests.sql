-- ============================================================
-- MedSync migration 016 - refill requests
-- A patient asks the prescribing doctor to renew a finished (or nearly finished) course.
-- Approving creates a NEW prescription (new_prescription_id); the original is never changed.
-- ============================================================

CREATE TABLE IF NOT EXISTS refill_requests (
    refill_id INT AUTO_INCREMENT PRIMARY KEY,
    prescription_id INT NOT NULL,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    note VARCHAR(255) NULL,
    status ENUM('REQUESTED','APPROVED','DECLINED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    doctor_note VARCHAR(255) NULL,
    new_prescription_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    CONSTRAINT fk_refill_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    CONSTRAINT fk_refill_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_refill_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    CONSTRAINT fk_refill_new_prescription FOREIGN KEY (new_prescription_id) REFERENCES prescriptions(prescription_id) ON DELETE SET NULL,
    INDEX ix_refill_doctor_status (doctor_id, status),
    INDEX ix_refill_patient (patient_id, created_at),
    INDEX ix_refill_prescription (prescription_id, status)
);
