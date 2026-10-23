const { auditSafe } = require("../utils/auditSafe");

// Records every successful write by a signed-in user, e.g. POST_PRESCRIPTIONS / PUT_BATCHES.
// Uses req.originalUrl: inside a router req.path is relative, which used to produce "POST_RESOURCE".
function auditMutations(req, res, next) {
    res.on("finish", () => {
        if (!req.user || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || res.statusCode >= 400) return;
        const segments = req.originalUrl.split("?")[0].split("/").filter(Boolean); // ["api", "prescriptions", "12", ...]
        const resource = segments[1] || "resource";
        const idSegment = segments.slice(2).find((s) => /^\d+$/.test(s));
        auditSafe({
            userId: req.user.id,
            action: `${req.method}_${resource.toUpperCase()}`,
            entityType: resource,
            entityId: idSegment ? Number(idSegment) : null,
            details: { method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode },
            ip: req.ip
        });
    });
    next();
}

module.exports = { auditMutations };
