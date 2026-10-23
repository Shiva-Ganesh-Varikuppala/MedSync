require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to a value of at least 32 characters");
}

module.exports = {
    isProduction,
    jwtSecret,
    jwtExpiresMinutes: Number(process.env.JWT_EXPIRES_MINUTES) || 60,
    cookieName: "medsync_token"
};
