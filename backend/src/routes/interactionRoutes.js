const express = require("express"); const c = require("../controllers/interactionController"); const { authenticate } = require("../middleware/auth"); const asyncHandler = require("../utils/asyncHandler"); const router = express.Router();
router.use(authenticate); router.get("/check", asyncHandler(c.check)); router.get("/:medicineId", asyncHandler(c.get)); module.exports = router;
