const mysql = require("mysql2/promise");
require("dotenv").config();
const { connectionOptions, timezoneOf } = require("./dbOptions");

const pool = mysql.createPool({
    ...connectionOptions(),
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Return DATE / DATETIME columns as plain strings ("2026-10-21") instead of
    // JavaScript Date objects, so API output never shifts with time zones.
    dateStrings: true
});

// A cloud database usually runs in UTC. DB_TIMEZONE (e.g. +05:30) makes NOW() and CURDATE() follow your clinic's time.
const tz = timezoneOf();
if (tz) pool.on("connection", (conn) => conn.query(`SET time_zone = '${tz}'`));

module.exports = pool;
