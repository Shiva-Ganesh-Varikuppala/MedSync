const express = require("express");
const controller = require("../controllers/medicineController");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const router = express.Router();

router.get("/search", authenticate, asyncHandler(controller.search));
router.get("/", authenticate, asyncHandler(controller.list));
router.get("/:medicineId", authenticate, asyncHandler(controller.get));
router.post("/", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.create));
router.put("/:medicineId", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.update));
router.delete("/:medicineId", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.remove));
module.exports = router;
