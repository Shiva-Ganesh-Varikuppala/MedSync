// Checks the email settings in .env by connecting to the mail server and signing in.
// It sends NO email and never prints the password.
//   npm run smtp:check
const path = require("path");
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || path.join(__dirname, "..", ".env") });
const { verifySmtp, frontendUrl } = require("../src/services/messageSender");

verifySmtp().then((r) => {
    console.log(`SMTP host:       ${r.host || "(not set)"}`);
    console.log(`SMTP port:       ${r.port}${r.secure ? " (SSL)" : " (STARTTLS)"}`);
    console.log(`Sign-in set:     ${r.sign_in_set ? "yes (SMTP_USER and SMTP_PASS are present)" : "no"}`);
    console.log(`Sender:          ${r.from || "(not set)"}`);
    console.log(`Links point to:  ${frontendUrl()}`);
    console.log(r.ok ? "\nOK - the mail server accepted the connection and the login." : `\nNOT READY - ${r.problem}`);
    process.exit(r.ok ? 0 : 1);
});
