const express = require("express");
const cookieParser = require("cookie-parser");
const healthRoutes = require("./routes/healthRoutes");
const apiRoutes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { auditMutations } = require("./middleware/auditMutations");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // so req.ip is the real client address behind a proxy

app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store"
    });
    next();
});

// Only needed when the frontend is served from a different origin than the API
// (in development the Vite proxy makes them the same origin). Set CORS_ORIGIN=https://your-frontend.
if (process.env.CORS_ORIGIN) {
    app.use((req, res, next) => {
        if (req.headers.origin === process.env.CORS_ORIGIN) {
            res.set({
                "Access-Control-Allow-Origin": process.env.CORS_ORIGIN,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Vary": "Origin"
            });
        }
        if (req.method === "OPTIONS") return res.sendStatus(204);
        next();
    });
}

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(auditMutations);

app.use("/api/health", healthRoutes);
app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
