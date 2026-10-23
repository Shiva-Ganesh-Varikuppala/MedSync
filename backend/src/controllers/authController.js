const authService = require("../services/authService");
const { clearFailures, recordFailure } = require("../middleware/loginThrottle");
const { clearPasswordFailures, recordPasswordFailure } = require("../middleware/passwordThrottle");

const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
};

const REFRESH_COOKIE_OPTS = {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/api/auth"
};

async function register(req, res) {
    const user = await authService.register(req.body || {});
    res.status(201).json({ success: true, message: "Registration successful", data: { user } });
}

async function login(req, res) {
    try {
        const data = await authService.login(req.body || {}, req.ip, req.headers["user-agent"]);
        clearFailures(req);

        // Set HttpOnly cookies for enterprise browser sessions
        res.cookie("auth_token", data.token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 });
        if (data.refreshToken) {
            res.cookie("refresh_token", data.refreshToken, REFRESH_COOKIE_OPTS);
        }

        res.json({ success: true, message: "Login successful", data });
    } catch (error) {
        recordFailure(req);
        throw error;
    }
}

async function refresh(req, res) {
    const raw = req.cookies?.refresh_token || req.body?.refreshToken;
    const data = await authService.rotateRefreshToken(raw, {
        ip: req.ip,
        userAgent: req.headers["user-agent"]
    });

    res.cookie("auth_token", data.token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 });
    res.cookie("refresh_token", data.refreshToken, REFRESH_COOKIE_OPTS);

    res.json({ success: true, message: "Token refreshed successfully", data });
}

async function logout(req, res) {
    const raw = req.cookies?.refresh_token || req.body?.refreshToken;
    if (raw && req.user?.id) {
        await authService.revokeRefreshToken(raw, req.user.id);
    }
    res.clearCookie("auth_token", COOKIE_OPTS);
    res.clearCookie("refresh_token", REFRESH_COOKIE_OPTS);
    res.json({ success: true, message: "Logged out successfully" });
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
        res.cookie("auth_token", data.token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 });
        res.json({ success: true, message: "Password changed successfully", data });
    } catch (error) {
        if (error.status === 400 && /Current password/.test(error.message)) recordPasswordFailure(req.user.id);
        throw error;
    }
}

module.exports = {
    changePassword,
    login,
    logout,
    me,
    refresh,
    register,
    updateMe
};
