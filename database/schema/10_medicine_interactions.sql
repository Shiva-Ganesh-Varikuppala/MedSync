CREATE TABLE medicine_interactions (
    interaction_id INT AUTO_INCREMENT PRIMARY KEY,

    medicine_id_1 INT NOT NULL,

    medicine_id_2 INT NOT NULL,

    severity ENUM('MILD', 'MODERATE', 'SEVERE') NOT NULL,

    description TEXT NOT NULL,

    CONSTRAINT fk_interaction_medicine_1
        FOREIGN KEY (medicine_id_1)
        REFERENCES medicines(medicine_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_interaction_medicine_2
        FOREIGN KEY (medicine_id_2)
        REFERENCES medicines(medicine_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);