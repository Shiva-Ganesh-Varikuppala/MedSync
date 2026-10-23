const express = require("express");
const controller = require("../controllers/medicineController");
const externalDrugService = require("../services/externalDrugService");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const router = express.Router();

router.get("/external/search", authenticate, asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: "External drug search results",
        data: await externalDrugService.searchRxNorm(req.query.q, req.query.maxEntries)
    });
}));

router.get("/external/forms", authenticate, asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: "External drug clinical forms",
        data: await externalDrugService.getClinicalForms(req.query.name)
    });
}));

router.get("/external/properties/:rxcui", authenticate, asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: "External drug properties",
        data: await externalDrugService.getDrugProperties(req.params.rxcui)
    });
}));

router.get("/search", authenticate, asyncHandler(controller.search));
router.get("/", authenticate, asyncHandler(controller.list));
router.get("/:medicineId", authenticate, asyncHandler(controller.get));
router.post("/", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.create));
router.put("/:medicineId", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.update));
router.delete("/:medicineId", authenticate, requireRole("PHARMACY_STAFF"), asyncHandler(controller.remove));

module.exports = router;
