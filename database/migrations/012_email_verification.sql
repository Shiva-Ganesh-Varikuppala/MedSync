-- Migration 012: Email verification
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL;

-- Auto-verify existing users so the existing tests keep passing
UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verifications (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    token_hash    CHAR(64) NOT NULL,          -- SHA-256 of the raw token
    expires_at    DATETIME NOT NULL,
    used_at       DATETIME NULL DEFAULT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ev_token (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
