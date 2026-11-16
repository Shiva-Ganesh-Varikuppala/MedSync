const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const exports_ = require("../services/exportService");

// Downloads. Each one is built on the server after the caller's role and ownership are checked, and is never cached.
const router = express.Router();
router.use(authenticate);

function send(res, file) {
    res.set({
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/[^\w.\-]/g, "_")}"`,
        "Content-Length": file.buffer.length,
        "Cache-Control": "no-store"
    });
    res.send(file.buffer);
}

// A prescription as a PDF: its doctor, its patient and pharmacy staff (others get 404).
router.get("/prescriptions/:prescriptionId", asyncHandler(async (req, res) => {
    send(res, await exports_.prescriptionPdf(req.user, req.params.prescriptionId, req.ip));
}));

// The patient's own data: ?format=json (default) or ?format=csv&part=prescriptions|reminders
router.get("/my-data", requireRole("PATIENT"), asyncHandler(async (req, res) => {
    send(res, await exports_.patientData(req.user, req.query, req.ip));
}));

// Administrator reports as CSV: users, stock, audit (?from=YYYY-MM-DD&to=YYYY-MM-DD)
router.get("/admin/:report", requireRole("ADMIN"), asyncHandler(async (req, res) => {
    send(res, await exports_.adminReport(req.user, req.params.report, req.query, req.ip));
}));

module.exports = router;
