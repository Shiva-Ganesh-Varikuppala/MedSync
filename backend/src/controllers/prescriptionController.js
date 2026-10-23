const service = require("../services/prescriptionService");
const interactions = require("../services/interactionService");
async function create(req, res) {
    const id = await service.create(req.user.doctorId, req.body || {}, { userId: req.user.id, ip: req.ip });
    const data = await service.get(id, req.user);
    // Informational only: warnings never block a prescription.
    const medicineIds = [...new Set(data.items.map((i) => i.medicine_id))];
    const interaction_warnings = medicineIds.length > 1 ? await interactions.check(medicineIds.join(",")) : [];
    res.status(201).json({ success: true, message: "Prescription created successfully", data: { ...data, interaction_warnings } });
}
async function get(req, res) { res.json({ success: true, message: "Prescription retrieved successfully", data: await service.get(req.params.prescriptionId, req.user) }); }
async function items(req, res) { const prescription = await service.get(req.params.prescriptionId, req.user); res.json({ success: true, message: "Prescription items retrieved successfully", data: prescription.items }); }
async function cancel(req, res) { res.json({ success: true, message: "Prescription cancelled", data: await service.cancel(req.params.prescriptionId, req.user, req.ip) }); }
module.exports = { cancel, create, get, items };
