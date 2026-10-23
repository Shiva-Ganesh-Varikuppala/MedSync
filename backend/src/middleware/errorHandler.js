const { HttpError } = require("../utils/httpError");

function notFoundHandler(req, res) {
    res.status(404).json({ success: false, message: "Route not found" });
}

// Last line of defence: every error leaves the API in one shape and never leaks
// SQL text, stack traces or file paths to the client.
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof HttpError) {
        const body = { success: false, message: err.message };
        if (err.details) body.details = err.details;
        return res.status(err.status).json(body);
    }
    if (err && err.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Request body is not valid JSON" });
    }
    if (err && err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request body is too large" });
    }
    if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ success: false, message: "That record already exists" });
    }
    if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_CHECK_CONSTRAINT_VIOLATED")) {
        return res.status(400).json({ success: false, message: "The data violates a database rule" });
    }

    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Something went wrong on our side" });
}

module.exports = { notFoundHandler, errorHandler };
