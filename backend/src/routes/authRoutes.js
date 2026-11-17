const express = require("express");
const controller = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { checkThrottle } = require("../middleware/loginThrottle");
const { checkPasswordThrottle } = require("../middleware/passwordThrottle");
const { phoneSendLimit, phoneVerifyLimit, registerLimit, resendLimit, verifyLimit } = require("../middleware/rateLimit");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.post("/register", registerLimit, asyncHandler(controller.register));
router.post("/verify-email", verifyLimit, asyncHandler(controller.verifyEmail));
router.post("/resend-verification", resendLimit, asyncHandler(controller.resendVerification));
router.post("/login", checkThrottle, asyncHandler(controller.login));
router.post("/refresh", asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", authenticate, asyncHandler(controller.me));
router.put("/me", authenticate, asyncHandler(controller.updateMe));
router.post("/phone/send-code", authenticate, phoneSendLimit, asyncHandler(controller.sendPhoneCode));
router.post("/phone/verify", authenticate, phoneVerifyLimit, asyncHandler(controller.verifyPhone));
router.put("/password", authenticate, checkPasswordThrottle, asyncHandler(controller.changePassword));

module.exports = router;
