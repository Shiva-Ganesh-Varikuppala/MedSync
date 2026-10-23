-- ============================================================
-- MedSync migration 004 - pharmacy prescription dispensing
-- ============================================================
USE medsync;

ALTER TABLE prescriptions
    MODIFY COLUMN status ENUM('ACTIVE','CANCELLED','DISPENSED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN dispensed_at DATETIME NULL,
    ADD COLUMN dispensed_by INT NULL,
    ADD COLUMN dispensed_pharmacy_id INT NULL,
    ADD CONSTRAINT fk_prescription_dispensed_by FOREIGN KEY (dispensed_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD CONSTRAINT fk_prescription_dispensed_pharmacy FOREIGN KEY (dispensed_pharmacy_id) REFERENCES pharmacies(pharmacy_id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dispensed_items (
    dispensed_item_id INT AUTO_INCREMENT PRIMARY KEY,
    prescription_id INT NOT NULL,
    prescription_item_id INT NOT NULL,
    batch_id INT NOT NULL,
    quantity INT NOT NULL,
    dispensed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dispensed_by INT NOT NULL,
    pharmacy_id INT NOT NULL,
    CONSTRAINT chk_dispensed_qty CHECK (quantity > 0),
    CONSTRAINT fk_disp_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    CONSTRAINT fk_disp_item FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(prescription_item_id) ON DELETE CASCADE,
    CONSTRAINT fk_disp_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches(batch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_disp_user FOREIGN KEY (dispensed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_disp_pharmacy FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(pharmacy_id) ON DELETE RESTRICT
);

CREATE INDEX ix_dispensed_prescription ON dispensed_items (prescription_id);
CREATE INDEX ix_dispensed_pharmacy ON dispensed_items (pharmacy_id, dispensed_at);
