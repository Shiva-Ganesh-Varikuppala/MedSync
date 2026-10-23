const service = require("../services/adminService");
const ok = (res, message, data, status = 200) => res.status(status).json({ success: true, message, data });
module.exports = {
    summary: async (req, res) => ok(res, "Summary retrieved successfully", await service.summary()),
    listUsers: async (req, res) => ok(res, "Users retrieved successfully", await service.listUsers(req.query)),
    createUser: async (req, res) => ok(res, "User created successfully", await service.createUser(req.user, req.body || {}, req.ip), 201),
    setActive: async (req, res) => ok(res, "User updated successfully", await service.setActive(req.user, req.params.userId, (req.body || {}).is_active, req.ip)),
    createPharmacy: async (req, res) => ok(res, "Pharmacy created successfully", await service.createPharmacy(req.user, req.body || {}, req.ip), 201)
};
