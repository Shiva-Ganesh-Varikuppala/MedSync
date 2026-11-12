-- 011: files attached to a prescription (scans, lab reports, a doctor's letter).
-- The file itself lives in Azure Blob Storage (or a local folder in development);
-- this table keeps only the facts about it, so it can be listed and permission-checked with SQL.
CREATE TABLE IF NOT EXISTS prescription_attachments (
    attachment_id   INT AUTO_INCREMENT PRIMARY KEY,
    prescription_id INT NOT NULL,
    uploaded_by     INT NOT NULL,
    file_name       VARCHAR(120) NOT NULL,
    content_type    VARCHAR(60)  NOT NULL,
    size_bytes      INT NOT NULL,
    blob_name       VARCHAR(190) NOT NULL UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attach_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_attach_user FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_attach_size CHECK (size_bytes > 0)
);
CREATE INDEX ix_attach_prescription ON prescription_attachments (prescription_id);
