const authService = require("../services/authService");
const { clearFailures, recordFailure } = require("../middleware/loginThrottle");
const { clearPasswordFailures, recordPasswordFailure } = require("../middleware/passwordThrottle");

async function register(req, res) {
    const user = await authService.register(req.body || {});
    res.status(201).json({ success: true, message: "Registration successful", data: { user } });
}

async function login(req, res) {
    try {
        const data = await authService.login(req.body || {}, req.ip);
        clearFailures(req);
        res.json({ success: true, message: "Login successful", data });
    } catch (error) {
        recordFailure(req);
        throw error;
    }
}

async function me(req, res) {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, message: "Profile retrieved successfully", data: { user } });
}

async function updateMe(req, res) {
    const user = await authService.updateProfile(req.user.id, req.user.role, req.body || {}, req.ip);
    res.json({ success: true, message: "Profile updated successfully", data: { user } });
}

async function changePassword(req, res) {
    try {
        const data = await authService.changePassword(req.user.id, req.body || {}, req.ip);
        clearPasswordFailures(req.user.id);
        res.json({ success: true, message: "Password changed successfully", data });
    } catch (error) {
        if (error.status === 400 && /Current password/.test(error.message)) recordPasswordFailure(req.user.id);
        throw error;
    }
}

module.exports = { changePassword, login, me, register, updateMe };
