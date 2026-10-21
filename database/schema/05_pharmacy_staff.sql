CREATE TABLE pharmacy_staff (
    pharmacy_staff_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    pharmacy_id INT NOT NULL,

    CONSTRAINT fk_pharmacy_staff_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pharmacy_staff_pharmacy
        FOREIGN KEY (pharmacy_id)
        REFERENCES pharmacies(pharmacy_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);