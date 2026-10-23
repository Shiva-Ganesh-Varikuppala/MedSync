const service = require("../services/medicineService");

async function list(req, res) { res.json({ success: true, message: "Medicines retrieved successfully", data: await service.list(req.query) }); }
async function get(req, res) { res.json({ success: true, message: "Medicine retrieved successfully", data: await service.getById(req.params.medicineId) }); }
async function search(req, res) { res.json({ success: true, message: "Medicines retrieved successfully", data: await service.search(req.query) }); }
async function create(req, res) { res.status(201).json({ success: true, message: "Medicine created successfully", data: await service.create(req.body || {}) }); }
async function update(req, res) { res.json({ success: true, message: "Medicine updated successfully", data: await service.update(req.params.medicineId, req.body || {}) }); }
async function remove(req, res) { await service.remove(req.params.medicineId); res.status(204).end(); }

module.exports = { create, get, list, remove, search, update };
