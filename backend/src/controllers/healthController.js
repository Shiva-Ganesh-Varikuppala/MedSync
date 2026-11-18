"use strict";
const DEMO_MODE = process.env.DEMO_MODE === "true";

const healthCheck = async (req, res) => {
    if (DEMO_MODE) {
        return res.status(200).json({
            success: true,
            message: "MedSync demo API is healthy",
            database: "disabled",
            mode: "demo"
        });
    }
    // Normal mode: test the actual DB connection
    try {
        const pool = require("../config/database");
        await pool.query("SELECT 1");
        res.status(200).json({
            success: true,
            message: "MedSync API is healthy",
            database: "connected"
        });
    } catch (error) {
        console.error("Health check failed:", error.message);
        res.status(500).json({
            success: false,
            message: "MedSync API is unhealthy",
            database: "disconnected"
        });
    }
};

module.exports = { healthCheck };
