const express = require("express");
const c = require("../controllers/patientController");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.use(authenticate, requireRole("PATIENT"));

router.get("/me", asyncHandler(c.me));
router.get("/me/notifications", asyncHandler(c.notifications));
router.get("/me/reminders", asyncHandler(require("../controllers/reminderController").list));
router.get("/me/calendar", asyncHandler(async (req, res) => res.json({ success: true, message: "Calendar retrieved successfully", data: await require("../services/calendarService").patientCalendar(req.user.patientId, req.query) })));
router.get("/me/calendar.ics", asyncHandler(async (req, res) => {
    const f = await require("../services/calendarService").patientIcs(req.user, req.query, req.ip);
    res.set({ "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${f.filename}"`, "Content-Length": f.buffer.length, "Cache-Control": "no-store" });
    res.end(f.buffer);
}));
router.get("/me/prescriptions/active", asyncHandler(c.active));
router.get("/me/prescriptions/:prescriptionId", asyncHandler(c.detail));
router.get("/me/prescriptions", asyncHandler(c.history));

module.exports = router;
