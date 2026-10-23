const express = require("express");
const healthRoutes = require("./healthRoutes");
const authRoutes = require("./authRoutes");
const medicineRoutes = require("./medicineRoutes");
const patientRoutes = require("./patientRoutes");
const prescriptionRoutes = require("./prescriptionRoutes");
const interactionRoutes = require("./interactionRoutes");
const doctorRoutes = require("./doctorRoutes");
const reminderRoutes = require("./reminderRoutes");
const pharmacyRoutes = require("./pharmacyRoutes");
const batchRoutes = require("./batchRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/medicines", medicineRoutes);
router.use("/patients", patientRoutes);
router.use("/prescriptions", prescriptionRoutes);
router.use("/interactions", interactionRoutes);
router.use("/doctors", doctorRoutes);
router.use("/reminders", reminderRoutes);
router.use("/pharmacies", pharmacyRoutes);
router.use("/batches", batchRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
