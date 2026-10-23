const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Return DATE / DATETIME columns as plain strings ("2026-10-21") instead of
    // JavaScript Date objects, so API output never shifts with time zones.
    dateStrings: true
});

module.exports = pool;
