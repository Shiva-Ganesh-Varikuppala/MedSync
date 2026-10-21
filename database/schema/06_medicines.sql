CREATE TABLE medicines (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    generic_name VARCHAR(150) NOT NULL,

    description TEXT,

    dosage_form VARCHAR(50) NOT NULL,

    strength VARCHAR(100) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);