const express = require("express"); const c = require("../controllers/prescriptionController"); const { authenticate, requireRole } = require("../middleware/auth"); const asyncHandler = require("../utils/asyncHandler"); const attachments = require("../services/attachmentService");
const router = express.Router();
router.post("/", authenticate, requireRole("DOCTOR"), asyncHandler(c.create)); router.post("/:prescriptionId/cancel", authenticate, requireRole("DOCTOR"), asyncHandler(c.cancel)); // Files on a prescription: the raw file is the request body (not JSON); the name travels in ?name=.
const rawFile = express.raw({ type: ["application/pdf", "image/png", "image/jpeg"], limit: attachments.MAX_BYTES + 1024 });
router.get("/:prescriptionId/attachments", authenticate, asyncHandler(async (req, res) => {
    res.json({ success: true, message: "Files", data: await attachments.list(req.params.prescriptionId, req.user) });
}));
router.post("/:prescriptionId/attachments", authenticate, requireRole("DOCTOR"), rawFile, asyncHandler(async (req, res) => {
    const file = await attachments.upload(req.params.prescriptionId, req.user, { buffer: req.body, contentType: (req.headers["content-type"] || "").split(";")[0], fileName: req.query.name });
    res.status(201).json({ success: true, message: "File uploaded", data: file });
}));
router.get("/:prescriptionId/items", authenticate, asyncHandler(c.items)); router.get("/:prescriptionId", authenticate, asyncHandler(c.get)); module.exports = router;
