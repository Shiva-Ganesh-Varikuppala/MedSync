CREATE TABLE patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    date_of_birth DATE NOT NULL,

    gender VARCHAR(30),

    address VARCHAR(255),

    CONSTRAINT fk_patient_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);