-- ============================================================
-- MedSync migration 005 - notifications and cron automation
-- ============================================================
USE medsync;

ALTER TABLE reminders
    MODIFY COLUMN status ENUM('PENDING','TAKEN','SKIPPED','MISSED') NOT NULL DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reminder_id INT NULL,
    channel ENUM('EMAIL', 'SMS', 'PUSH', 'IN_APP') NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT NULL,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_reminder FOREIGN KEY (reminder_id) REFERENCES reminders(reminder_id) ON DELETE SET NULL
);

CREATE INDEX ix_notif_user_time ON notifications (user_id, sent_at);
CREATE INDEX ix_notif_reminder ON notifications (reminder_id);
