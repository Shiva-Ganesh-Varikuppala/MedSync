const app = require("./app");
const pool = require("./config/database");

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        const connection = await pool.getConnection();
        connection.release();
        console.log("✅ MySQL database connected successfully");

        const server = app.listen(PORT, () => {
            console.log(`MedSync backend running on port ${PORT}`);
        });
        server.on("error", (error) => {
            console.error(`Unable to start MedSync on port ${PORT}: ${error.message}`);
            process.exit(1);
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
}

startServer();
