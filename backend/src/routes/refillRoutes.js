const express = require("express");
const service = require("../services/refillService");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);

const ok = (res, message, data, meta) => res.json({ success: true, message, data, ...(meta ? { meta } : {}) });

// Patient: which prescriptions can be refilled now, ask for one, withdraw a request.
router.get("/eligible", requireRole("PATIENT"), asyncHandler(async (req, res) => ok(res, "Refillable prescriptions retrieved successfully", await service.eligible(req.user.patientId))));
router.post("/", requireRole("PATIENT"), asyncHandler(async (req, res) => res.status(201).json({ success: true, message: "Refill requested successfully", data: await service.request(req.user, req.body || {}, req.ip) })));
router.post("/:id/cancel", requireRole("PATIENT"), asyncHandler(async (req, res) => ok(res, "Refill request cancelled", await service.cancel(req.user, req.params.id, req.ip))));

// Both: own requests. Doctor: answer them.
router.get("/", requireRole("PATIENT", "DOCTOR"), asyncHandler(async (req, res) => {
    const { rows, has_more } = await service.list(req.user, req.query);
    ok(res, "Refill requests retrieved successfully", rows, { has_more });
}));
router.post("/:id/approve", requireRole("DOCTOR"), asyncHandler(async (req, res) => ok(res, "Refill approved", await service.approve(req.user, req.params.id, req.body || {}, req.ip))));
router.post("/:id/decline", requireRole("DOCTOR"), asyncHandler(async (req, res) => ok(res, "Refill declined", await service.decline(req.user, req.params.id, req.body || {}, req.ip))));

module.exports = router;
