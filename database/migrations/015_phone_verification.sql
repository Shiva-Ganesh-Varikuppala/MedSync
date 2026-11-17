-- Migration 015: optional phone number verification (SMS code from My profile)
-- users.phone_verified_at is set when the person enters the right code for the number on their profile.
ALTER TABLE users ADD COLUMN phone_verified_at DATETIME NULL DEFAULT NULL;

-- One row per code that was sent. Only a keyed hash of the 6-digit code is stored, never the code.
CREATE TABLE IF NOT EXISTS phone_verifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    phone       VARCHAR(20) NOT NULL,            -- the number the code was sent to, in +<country><number> form
    code_hash   CHAR(64) NOT NULL,               -- HMAC-SHA256 of the code
    attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_pv_user (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
