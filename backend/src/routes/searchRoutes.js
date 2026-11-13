const express = require("express"); const { authenticate } = require("../middleware/auth"); const { search } = require("../controllers/searchController"); const asyncHandler = require("../utils/asyncHandler");
const router = express.Router(); router.get("/", authenticate, asyncHandler(search)); module.exports = router;
