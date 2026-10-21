CREATE TABLE prescriptions (
    prescription_id INT AUTO_INCREMENT PRIMARY KEY,

    doctor_id INT NOT NULL,

    patient_id INT NOT NULL,

    prescription_date DATE NOT NULL,

    diagnosis TEXT,

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_prescription_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES doctors(doctor_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_prescription_patient
        FOREIGN KEY (patient_id)
        REFERENCES patients(patient_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);