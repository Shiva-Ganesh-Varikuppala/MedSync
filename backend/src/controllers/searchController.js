const service = require("../services/searchService");
async function search(req, res) { res.json({ success: true, message: "Search completed successfully", data: await service.search(req.user, req.query) }); }
module.exports = { search };
