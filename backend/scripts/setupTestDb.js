// Builds a throw-away test database from the project's own SQL files:
//   database/schema/*.sql -> database/seeds/*.sql -> database/migrations/*.sql
// The database name is DB_TEST_NAME, or "<DB_NAME>_test". It is DROPPED and
// recreated every time, so it can never touch your real "medsync" database.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const testDbName = () => process.env.DB_TEST_NAME || `${process.env.DB_NAME}_test`;

async function setupTestDb() {
    const name = testDbName();
    if (!/_test$/.test(name)) throw new Error(`Refusing to reset "${name}": test database names must end with _test`);

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        multipleStatements: true
    });
    try {
        await conn.query(`DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\`; USE \`${name}\`;`);
        const root = path.join(__dirname, "..", "..", "database");
        for (const dir of ["schema", "seeds", "migrations"]) {
            const folder = path.join(root, dir);
            if (!fs.existsSync(folder)) continue;
            for (const file of fs.readdirSync(folder).filter((f) => f.endsWith(".sql")).sort()) {
                // The files say "USE medsync;" - drop that so everything lands in the test database.
                const sql = fs.readFileSync(path.join(folder, file), "utf8").replace(/^\s*USE\s+[^;]+;/gim, "");
                await conn.query(sql);
            }
        }
    } finally {
        await conn.end();
    }
    return name;
}

module.exports = { setupTestDb, testDbName };

if (require.main === module) {
    setupTestDb().then((n) => console.log(`Test database "${n}" is ready.`)).catch((e) => { console.error(e.message); process.exit(1); });
}
