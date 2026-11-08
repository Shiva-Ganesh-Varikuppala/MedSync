-- ============================================================
-- MedSync migration 009 - appointments (patient requests a slot, doctor confirms)
-- ============================================================
USE medsync;

CREATE TABLE IF NOT EXISTS appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'REQUESTED',
    doctor_note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    INDEX ix_appt_doctor_time (doctor_id, scheduled_at),
    INDEX ix_appt_patient_time (patient_id, scheduled_at)
);
