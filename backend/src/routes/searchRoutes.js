const express = require("express");
const service = require("../services/searchService");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);
// One search box for everyone; the service decides what each role may see.
router.get("/", asyncHandler(async (req, res) => res.json({ success: true, message: "Search results", data: await service.search(req.user, req.query) })));

module.exports = router;
