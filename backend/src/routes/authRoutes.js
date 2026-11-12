const express = require("express");
const controller = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { checkThrottle } = require("../middleware/loginThrottle");
const { checkPasswordThrottle } = require("../middleware/passwordThrottle");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.post("/register", asyncHandler(controller.register));
router.post("/login", checkThrottle, asyncHandler(controller.login));
router.post("/refresh", asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", authenticate, asyncHandler(controller.me));
router.put("/me", authenticate, asyncHandler(controller.updateMe));
router.put("/password", authenticate, checkPasswordThrottle, asyncHandler(controller.changePassword));

router.get("/verify-email", asyncHandler(controller.verifyEmail));
router.post("/resend-verification", asyncHandler(controller.resendVerification));

module.exports = router;
