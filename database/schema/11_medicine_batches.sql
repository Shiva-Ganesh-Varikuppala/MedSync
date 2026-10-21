CREATE TABLE medicine_batches (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,

    medicine_id INT NOT NULL,

    pharmacy_id INT NOT NULL,

    batch_number VARCHAR(100) NOT NULL,

    quantity INT NOT NULL,

    expiry_date DATE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_batch_medicine
        FOREIGN KEY (medicine_id)
        REFERENCES medicines(medicine_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_batch_pharmacy
        FOREIGN KEY (pharmacy_id)
        REFERENCES pharmacies(pharmacy_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_pharmacy_batch
        UNIQUE (pharmacy_id, batch_number)
);