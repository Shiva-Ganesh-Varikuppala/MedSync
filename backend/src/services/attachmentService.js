const crypto = require("crypto");
const pool = require("../config/database");
const blobStore = require("./blobStore");
const { badRequest, notFound } = require("../utils/httpError");
const { toInt } = require("../utils/validate");
const { writeAudit } = require("../utils/audit");

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024;
const MAX_PER_PRESCRIPTION = 10;
const TYPES = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
// The first bytes of a real file; the Content-Type header alone is not trusted.
const MAGIC = { "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff] };

const cleanName = (raw, type) => {
    const base = String(raw || "").split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, "").trim().slice(0, 100);
    return base || `file${TYPES[type]}`;
};

// Same visibility rule as reading the prescription itself; anyone else gets 404, so ids cannot be probed.
async function visiblePrescription(prescriptionId, user, { write = false } = {}) {
    const [[rx]] = await pool.execute("SELECT prescription_id, doctor_id, patient_id FROM prescriptions WHERE prescription_id = ?", [prescriptionId]);
    const mine = rx && ((user.role === "DOCTOR" && rx.doctor_id === user.doctorId) || (!write && ((user.role === "PATIENT" && rx.patient_id === user.patientId) || user.role === "PHARMACY_STAFF")));
    if (!mine) throw notFound("Prescription not found");
    return rx;
}

const publicRow = (r) => ({ attachment_id: r.attachment_id, prescription_id: r.prescription_id, file_name: r.file_name, content_type: r.content_type, size_bytes: r.size_bytes, uploaded_by_name: r.uploaded_by_name, created_at: r.created_at });

async function list(id, user) {
    const prescriptionId = toInt(id, "prescriptionId");
    await visiblePrescription(prescriptionId, user);
    const [rows] = await pool.execute(
        `SELECT a.*, u.name AS uploaded_by_name FROM prescription_attachments a JOIN users u ON u.user_id = a.uploaded_by
          WHERE a.prescription_id = ? ORDER BY a.attachment_id`, [prescriptionId]);
    return rows.map(publicRow);
}

async function upload(id, user, { buffer, contentType, fileName }) {
    const prescriptionId = toInt(id, "prescriptionId");
    await visiblePrescription(prescriptionId, user, { write: true });
    if (!TYPES[contentType]) throw badRequest("Send a PDF, PNG or JPEG file");
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw badRequest("The file is empty");
    if (buffer.length > MAX_BYTES) throw badRequest(`The file is larger than ${Math.round(MAX_BYTES / 1048576)} MB`);
    if (!MAGIC[contentType].every((b, i) => buffer[i] === b)) throw badRequest("The file content does not match its type");
    const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM prescription_attachments WHERE prescription_id = ?", [prescriptionId]);
    if (n >= MAX_PER_PRESCRIPTION) throw badRequest(`A prescription can have at most ${MAX_PER_PRESCRIPTION} files`);

    const blobName = `rx-${prescriptionId}/${crypto.randomUUID()}${TYPES[contentType]}`;
    const name = cleanName(fileName, contentType);
    await blobStore.put(blobName, buffer, contentType);
    try {
        const [saved] = await pool.execute(
            "INSERT INTO prescription_attachments (prescription_id, uploaded_by, file_name, content_type, size_bytes, blob_name) VALUES (?, ?, ?, ?, ?, ?)",
            [prescriptionId, user.id, name, contentType, buffer.length, blobName]);
        return { attachment_id: saved.insertId, file_name: name, content_type: contentType, size_bytes: buffer.length };
    } catch (e) {
        await blobStore.remove(blobName).catch(() => {}); // do not leave a file nobody can find
        throw e;
    }
}

async function findForUser(attachmentId, user, opts) {
    const [[row]] = await pool.execute("SELECT * FROM prescription_attachments WHERE attachment_id = ?", [toInt(attachmentId, "attachmentId")]);
    if (!row) throw notFound("File not found");
    await visiblePrescription(row.prescription_id, user, opts);
    return row;
}

async function download(attachmentId, user) {
    const row = await findForUser(attachmentId, user);
    let buffer;
    try { buffer = await blobStore.get(row.blob_name); } catch { throw notFound("File not found"); }
    return { row, buffer };
}

async function remove(attachmentId, user, ip) {
    const row = await findForUser(attachmentId, user, { write: true });
    await pool.execute("DELETE FROM prescription_attachments WHERE attachment_id = ?", [row.attachment_id]);
    await blobStore.remove(row.blob_name).catch(() => {});
    await writeAudit({ userId: user.id, action: "ATTACHMENT_DELETE", entityType: "prescription", entityId: row.prescription_id, details: { attachment_id: row.attachment_id, file_name: row.file_name }, ip });
    return { attachment_id: row.attachment_id };
}

module.exports = { download, list, remove, upload, MAX_BYTES };
