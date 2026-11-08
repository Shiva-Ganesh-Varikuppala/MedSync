const express = require("express");
const c = require("../controllers/adminController");
const cronService = require("../services/cronService");
const messageSender = require("../services/messageSender");
const pool = require("../config/database");
const { HttpError, badRequest } = require("../utils/httpError");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/summary", asyncHandler(c.summary));
router.get("/users", asyncHandler(c.listUsers));
router.post("/users", asyncHandler(c.createUser));
router.patch("/users/:userId/active", asyncHandler(c.setActive));
router.post("/users/:userId/password", asyncHandler(c.resetPassword));
router.post("/pharmacies", asyncHandler(c.createPharmacy));
router.post("/cron/run", asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: "Cron tasks executed successfully",
        data: await cronService.runAllCronTasks()
    });
}));

// What email/SMS is switched on (never shows a password or token) and a way to check it works.
router.get("/delivery", asyncHandler(async (req, res) => res.json({ success: true, message: "Delivery settings", data: messageSender.status() })));
router.post("/delivery/test", asyncHandler(async (req, res) => {
    const channel = (req.body || {}).channel;
    if (!["EMAIL", "SMS"].includes(channel)) throw badRequest("channel must be EMAIL or SMS");
    const [[me]] = await pool.query("SELECT email, phone FROM users WHERE user_id = ?", [req.user.id]);
    const text = "This is a test message from MedSync. If you can read it, delivery works.";
    try {
        if (channel === "EMAIL") await messageSender.sendEmail({ to: me.email, subject: "MedSync test message", text });
        else await messageSender.sendSms({ to: me.phone, text });
    } catch (e) {
        throw new HttpError(/not set up/.test(e.message) ? 400 : 502, e.message);
    }
    res.json({ success: true, message: channel === "EMAIL" ? `Test email sent to ${me.email}` : "Test SMS sent to the phone number on your profile", data: null });
}));

module.exports = router;
