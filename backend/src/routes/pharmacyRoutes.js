const express = require("express");
const c = require("../controllers/pharmacyController");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get("/", authenticate, asyncHandler(c.list));
// Must come before "/:pharmacyId" patterns that could swallow it; staff may only read their own pharmacy.
router.get("/:pharmacyId/stock-calendar", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(async (req, res) => {
    if (Number(req.params.pharmacyId) !== Number(req.user.pharmacyId)) throw require("../utils/httpError").forbidden("You can only view your own pharmacy");
    res.json({ success: true, message: "Stock calendar retrieved successfully", data: await require("../services/calendarService").stockCalendar(req.user.pharmacyId, req.query) });
}));
router.get("/:pharmacyId", authenticate, asyncHandler(c.get));
router.get("/:pharmacyId/inventory", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.inventory));
router.get("/:pharmacyId/low-stock", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.lowStock));
router.get("/:pharmacyId/expiring", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.expiring));
router.post("/:pharmacyId/batches", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.createBatch));

// Prescription Dispensing
router.get("/:pharmacyId/prescriptions/pending", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.pendingPrescriptions));
router.get("/:pharmacyId/prescriptions/:prescriptionId/stock", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.checkStock));
router.post("/:pharmacyId/prescriptions/:prescriptionId/dispense", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.dispense));
router.get("/:pharmacyId/dispensations", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(c.dispensations));

module.exports = router;
