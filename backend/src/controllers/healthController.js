const pool = require("../config/database");

const healthCheck = async (req, res) => {
    try {
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

module.exports = {
    healthCheck
};