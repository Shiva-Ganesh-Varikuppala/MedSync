-- 013: prescription templates. A doctor saves a common course (for example "fever") once and reuses it.
-- A template stores the course LENGTH in days, not dates, so it can be applied on any day.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS prescription_templates (
    template_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    diagnosis   VARCHAR(255) NULL,
    notes       TEXT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_template_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_template_name UNIQUE (doctor_id, name)
);

CREATE TABLE IF NOT EXISTS prescription_template_items (
    template_item_id  INT AUTO_INCREMENT PRIMARY KEY,
    template_id       INT NOT NULL,
    medicine_id       INT NOT NULL,
    dosage            VARCHAR(100) NOT NULL,
    frequency_per_day TINYINT NOT NULL,
    duration_days     SMALLINT NOT NULL,
    instructions      TEXT NULL,
    CONSTRAINT fk_template_item_template FOREIGN KEY (template_id) REFERENCES prescription_templates(template_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_template_item_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_template_item_frequency CHECK (frequency_per_day BETWEEN 1 AND 6),
    CONSTRAINT chk_template_item_days CHECK (duration_days BETWEEN 1 AND 365),
    INDEX ix_template_items_template (template_id)
);
