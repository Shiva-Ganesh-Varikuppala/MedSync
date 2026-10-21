CREATE TABLE doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    license_number VARCHAR(100) NOT NULL UNIQUE,

    specialization VARCHAR(100) NOT NULL,

    CONSTRAINT fk_doctor_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);