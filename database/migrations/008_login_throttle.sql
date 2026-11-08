-- ============================================================
-- MedSync migration 008 - failed-attempt counters kept in the database
-- (login lockout and change-password lockout survive a restart)
-- ============================================================
USE medsync;

CREATE TABLE IF NOT EXISTS throttle_attempts (
    scope VARCHAR(20) NOT NULL,
    throttle_key VARCHAR(190) NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    reset_at DATETIME NOT NULL,
    PRIMARY KEY (scope, throttle_key),
    INDEX ix_throttle_reset (reset_at)
);
