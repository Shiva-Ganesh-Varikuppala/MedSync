"use strict";
require("dotenv").config();
require("./config/env"); // validates JWT_SECRET before anything else

const app = require("./app");
const PORT = process.env.PORT || 5000;
const DEMO_MODE = process.env.DEMO_MODE === "true";

let shuttingDown = false;

async function startServer() {
    if (DEMO_MODE) {
        console.log("🟡 DEMO_MODE=true — starting without MySQL database");
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`MedSync demo backend running on port ${PORT}`);
        });
        server.on("error", (err) => {
            console.error(`Failed to start server on port ${PORT}:`, err.message);
            process.exit(1);
        });
        setupGracefulShutdown(server, null);
    } else {
        // Normal mode: require MySQL
        const pool = require("./config/database");
        const { startCronWorker } = require("./services/cronService");
        try {
            const connection = await pool.getConnection();
            connection.release();
            console.log("✅ MySQL database connected successfully");
            const server = app.listen(PORT, "0.0.0.0", () => {
                console.log(`MedSync backend running on port ${PORT}`);
                if (process.env.NODE_ENV !== "test") {
                    startCronWorker(60000);
                    console.log("⏰ Background cron worker started");
                }
            });
            server.on("error", (err) => {
                console.error(`Failed to start server on port ${PORT}:`, err.message);
                process.exit(1);
            });
            setupGracefulShutdown(server, pool);
        } catch (error) {
            console.error("Database connection failed:", error.message);
            process.exit(1);
        }
    }
}

function setupGracefulShutdown(server, pool) {
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`\n${signal} received — shutting down gracefully`);
        server.close(async () => {
            if (pool) {
                try { await pool.end(); } catch (_) {}
            }
            console.log("Server closed");
            process.exit(0);
        });
        // Force-exit after 10s if connections hang
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT",  () => shutdown("SIGINT"));
}

startServer();
