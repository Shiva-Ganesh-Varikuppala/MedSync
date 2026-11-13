const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const templates = require("../services/templateService");

// Prescription templates belong to one doctor and are never visible to anyone else.
const router = express.Router();
router.use(authenticate, requireRole("DOCTOR"));
const ctx = (req) => ({ userId: req.user.id, ip: req.ip });

router.get("/", asyncHandler(async (req, res) => {
    res.json({ success: true, message: "Templates retrieved successfully", data: await templates.list(req.user.doctorId) });
}));
router.post("/", asyncHandler(async (req, res) => {
    const id = await templates.create(req.user.doctorId, req.body || {}, ctx(req));
    res.status(201).json({ success: true, message: "Template saved", data: { template_id: id } });
}));
router.delete("/:templateId", asyncHandler(async (req, res) => {
    await templates.remove(req.user.doctorId, req.params.templateId, ctx(req));
    res.json({ success: true, message: "Template deleted" });
}));

module.exports = router;
