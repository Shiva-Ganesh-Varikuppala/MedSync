const express = require("express");
const c = require("../controllers/adminController");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));
router.get("/summary", asyncHandler(c.summary));
router.get("/users", asyncHandler(c.listUsers));
router.post("/users", asyncHandler(c.createUser));
router.patch("/users/:userId/active", asyncHandler(c.setActive));
router.post("/pharmacies", asyncHandler(c.createPharmacy));
module.exports = router;
