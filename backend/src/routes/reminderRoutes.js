const express = require("express");
const c = require("../controllers/reminderController");
const notificationService = require("../services/notificationService");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate, requireRole("PATIENT"));

router.post("/", asyncHandler(c.create));
router.get("/due", asyncHandler(c.due));
router.get("/", asyncHandler(c.list));
router.patch("/:reminderId/status", asyncHandler(c.update));
router.delete("/:reminderId", asyncHandler(c.remove));
router.post("/:reminderId/notify", asyncHandler(async (req, res) => {
    const data = await notificationService.notifyReminder(req.params.reminderId, req.body?.channels || ["EMAIL"], req.user.patientId);
    res.json({
        success: true,
        message: "Notification dispatched successfully",
        data
    });
}));

module.exports = router;
