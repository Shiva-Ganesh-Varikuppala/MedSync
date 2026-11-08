// Applies the database files in order and remembers which ones were applied, so it is safe to run again.
//   npm run db:migrate                 create the database if needed, apply schema + every new migration
//   npm run db:migrate -- --seed       also load the sample data (first run on an empty database only)
//   npm run db:migrate -- --baseline   the database was already set up by hand: just record every file as applied
// Works on Azure (set DB_SSL=true) and needs no mysql command-line client.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { connectionOptions } = require("../src/config/dbOptions");

const root = path.join(__dirname, "..", "..", "database");
const files = (dir) => {
    const folder = path.join(root, dir);
    return fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ key: `${dir}/${f}`, file: path.join(folder, f) })) : [];
};
// The files say "USE medsync;"; run them in whatever database DB_NAME names instead.
const sqlOf = (file) => fs.readFileSync(file, "utf8").replace(/^\s*USE\s+[^;]+;/gim, "");

async function main() {
    const args = process.argv.slice(2);
    const seed = args.includes("--seed"), baseline = args.includes("--baseline");
    const name = process.env.DB_NAME;
    if (!name || !/^[A-Za-z0-9_]+$/.test(name)) throw new Error("DB_NAME must be set, using letters, digits and underscores only");

    const conn = await mysql.createConnection({ ...connectionOptions(), multipleStatements: true });
    try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4`);
        await conn.query(`USE \`${name}\``);
        await conn.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(190) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        const done = new Set((await conn.query("SELECT filename FROM schema_migrations"))[0].map((r) => r.filename));
        const [[{ n: hasUsers }]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'users'", [name]);

        const plan = [];
        if (!hasUsers && !baseline) { plan.push(...files("schema")); if (seed) plan.push(...files("seeds")); }
        else if (!hasUsers && baseline) throw new Error("--baseline is for a database that already has the MedSync tables");
        else if (seed) console.log("Skipping --seed: the database already has tables.");
        plan.push(...files("migrations"));

        let ran = 0;
        for (const step of plan) {
            if (done.has(step.key)) continue;
            if (!baseline) {
                process.stdout.write(`Applying ${step.key} ... `);
                await conn.query(sqlOf(step.file));
                console.log("done");
            }
            await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [step.key]);
            ran++;
        }
        if (baseline) console.log(`Recorded ${ran} file(s) as already applied.`);
        else console.log(ran ? `Finished: ${ran} file(s) applied.` : "Nothing to do: the database is up to date.");
    } finally {
        await conn.end();
    }
}
main().catch((e) => { console.error(`Migration failed: ${e.message}`); process.exit(1); });
