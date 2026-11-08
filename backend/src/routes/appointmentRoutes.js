const express = require("express");
const service = require("../services/appointmentService");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);

const ok = (res, message, data, extra = {}) => res.json({ success: true, message, data, ...extra });

// Patients: list doctors, request, list own, cancel.
router.get("/doctors", requireRole("PATIENT"), asyncHandler(async (req, res) => ok(res, "Doctors retrieved successfully", await service.doctors())));
router.post("/", requireRole("PATIENT"), asyncHandler(async (req, res) => res.status(201).json({ success: true, message: "Appointment requested", data: await service.request(req.user, req.body || {}) })));
router.post("/:id/cancel", requireRole("PATIENT"), asyncHandler(async (req, res) => ok(res, "Appointment cancelled", await service.cancel(req.user, req.params.id))));

// Patients and doctors each see only their own.
router.get("/", requireRole("PATIENT", "DOCTOR"), asyncHandler(async (req, res) => {
    const { rows, has_more } = await service.list(req.user, req.query);
    ok(res, "Appointments retrieved successfully", rows, { meta: { has_more } });
}));

// Doctors: answer requests.
for (const action of ["confirm", "decline", "reschedule", "complete"]) {
    router.post(`/:id/${action}`, requireRole("DOCTOR"), asyncHandler(async (req, res) => ok(res, `Appointment ${action} done`, await service.decide(req.user, req.params.id, action, req.body || {}))));
}

module.exports = router;
