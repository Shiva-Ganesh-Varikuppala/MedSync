const express = require("express");
const attachments = require("../services/attachmentService");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);

router.get("/:attachmentId/download", asyncHandler(async (req, res) => {
    const { row, buffer } = await attachments.download(req.params.attachmentId, req.user);
    res.set({
        "Content-Type": row.content_type,
        "Content-Disposition": `attachment; filename="${row.file_name.replace(/"/g, "")}"`,
        "Content-Length": buffer.length
    });
    res.send(buffer);
}));

router.delete("/:attachmentId", asyncHandler(async (req, res) => {
    res.json({ success: true, message: "File deleted", data: await attachments.remove(req.params.attachmentId, req.user, req.ip) });
}));

module.exports = router;
