const service = require("../services/pharmacyService");

async function list(req, res) { res.json({ success: true, message: "Pharmacies retrieved successfully", data: await service.pharmacies() }); }
async function get(req, res) { res.json({ success: true, message: "Pharmacy retrieved successfully", data: await service.pharmacy(req.params.pharmacyId) }); }
async function inventory(req, res) {
    // With ?limit= the screen gets one page plus totals; without it the full list, as before.
    if (req.query.limit || req.query.page || req.query.q) {
        const { rows, meta } = await service.inventoryPage(req.user, req.params.pharmacyId, req.query);
        return res.json({ success: true, message: "Inventory retrieved successfully", data: rows, meta });
    }
    res.json({ success: true, message: "Inventory retrieved successfully", data: await service.inventory(req.user, req.params.pharmacyId) });
}
async function createBatch(req, res) { const id = await service.createBatch(req.user, req.params.pharmacyId, req.body || {}); res.status(201).json({ success: true, message: "Batch created successfully", data: { batch_id: id } }); }
async function quantity(req, res) { res.json({ success: true, message: "Batch quantity updated successfully", data: await service.updateQuantity(req.user, req.params.batchId, req.body || {}) }); }
async function updateBatch(req, res) { res.json({ success: true, message: "Batch updated successfully", data: await service.updateBatch(req.user, req.params.batchId, req.body || {}) }); }
async function remove(req, res) { await service.removeBatch(req.user, req.params.batchId); res.status(204).end(); }
async function lowStock(req, res) { res.json({ success: true, message: "Low-stock medicines retrieved successfully", data: await service.lowStock(req.user, req.params.pharmacyId) }); }
async function expiring(req, res) { res.json({ success: true, message: "Expiring batches retrieved successfully", data: await service.expiring(req.user, req.params.pharmacyId, req.query) }); }

async function pendingPrescriptions(req, res) {
    res.json({ success: true, message: "Pending prescriptions retrieved successfully", data: await service.pendingPrescriptions(req.user, req.params.pharmacyId, req.query) });
}
async function checkStock(req, res) {
    res.json({ success: true, message: "Prescription stock checked successfully", data: await service.checkStock(req.user, req.params.pharmacyId, req.params.prescriptionId) });
}
async function dispense(req, res) {
    const data = await service.dispense(req.user, req.params.pharmacyId, req.params.prescriptionId, req.body, { ip: req.ip });
    res.json({ success: true, message: "Prescription dispensed successfully", data });
}
async function dispensations(req, res) {
    res.json({ success: true, message: "Dispensations retrieved successfully", data: await service.dispensations(req.user, req.params.pharmacyId) });
}

module.exports = {
    checkStock,
    createBatch,
    dispense,
    dispensations,
    expiring,
    get,
    inventory,
    list,
    lowStock,
    pendingPrescriptions,
    quantity,
    remove,
    updateBatch
};
