// Connection settings shared by the app, the migration runner and the scripts.
//   DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME           the usual
//   DB_SSL=true                                          needed for Azure (it only accepts encrypted connections)
//   DB_SSL_CA=/path/to/ca.pem                            optional: a CA file; Azure's DigiCert root is already trusted by Node
//   DB_SSL_REJECT_UNAUTHORIZED=false                     only for a local test server with a self-made certificate
//   DB_TIMEZONE=+05:30                                   optional: time zone of every database session (Azure servers run in UTC)
const fs = require("fs");

function sslOptions(env = process.env) {
    if (String(env.DB_SSL || "").toLowerCase() !== "true") return undefined;
    const ssl = { rejectUnauthorized: String(env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false" };
    if (env.DB_SSL_CA) ssl.ca = fs.readFileSync(env.DB_SSL_CA);
    return ssl;
}

function connectionOptions(env = process.env) {
    const ssl = sslOptions(env);
    return {
        host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
        ...(ssl ? { ssl } : {})
    };
}

// Runs on every new pooled connection.
const timezoneOf = (env = process.env) => (/^[+-]\d{2}:\d{2}$/.test(env.DB_TIMEZONE || "") ? env.DB_TIMEZONE : null);

module.exports = { sslOptions, connectionOptions, timezoneOf };
