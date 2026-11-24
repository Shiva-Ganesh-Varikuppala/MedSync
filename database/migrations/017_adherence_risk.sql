-- ============================================================
-- MedSync migration 017 - adherence risk model
-- risk_models  : every model that was trained (weights + how well it did on a held-out test period)
-- patient_risk : the latest risk score per patient. It is a cache and can always be rebuilt from the reminders,
--                so it is safe to delete rows from it.
-- The score is advisory only: nothing in the app changes a prescription because of it.
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_models (
    model_id   INT AUTO_INCREMENT PRIMARY KEY,
    trained_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trained_by INT NULL,
    model      JSON NOT NULL,      -- names, mean, std, weights, bias
    metrics    JSON NOT NULL,      -- sizes of the training and test sets, AUC, the simple-rule AUC, precision, recall
    CONSTRAINT fk_risk_model_user FOREIGN KEY (trained_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS patient_risk (
    patient_id   INT PRIMARY KEY,
    model_id     INT NULL,         -- NULL = scored with the built-in starter model
    risk         DECIMAL(4,3) NULL,
    level        ENUM('LOW','MEDIUM','HIGH','UNKNOWN') NOT NULL,
    reasons      JSON NOT NULL,
    adherence_7  DECIMAL(5,1) NULL,
    adherence_30 DECIMAL(5,1) NULL,
    answered_30  INT NOT NULL DEFAULT 0,
    scored_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_risk_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_risk_model FOREIGN KEY (model_id) REFERENCES risk_models(model_id) ON DELETE SET NULL,
    INDEX ix_patient_risk_level (level, risk)
);
