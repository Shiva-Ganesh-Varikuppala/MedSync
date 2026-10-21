CREATE TABLE reminders (
    reminder_id INT AUTO_INCREMENT PRIMARY KEY,

    prescription_item_id INT NOT NULL,

    reminder_time TIME NOT NULL,

    status ENUM('ACTIVE', 'COMPLETED', 'DISMISSED') NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reminder_prescription_item
        FOREIGN KEY (prescription_item_id)
        REFERENCES prescription_items(prescription_item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);