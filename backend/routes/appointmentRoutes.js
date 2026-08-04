const express = require("express");
const router = express.Router();

const {
  getAllAppointments,
  getAppointment,
  deleteAppointment
} = require("../controllers/appointmentController");

const {
  createAppointment
} = require("../controllers/bookingController");

const {
  getAvailableSlots
} = require("../controllers/availabilityController");

const {
  updateAppointment
} = require("../controllers/appointmentEditController");
const { protect, ownerOnly } = require('../middleware/authMiddleware');
const { createChangeRequest, resolveChangeRequest } = require('../controllers/appointmentChangeRequestController');

router.use(protect);
router.post("/", createAppointment);
router.get("/available/:date", getAvailableSlots);

router.get("/", getAllAppointments);
router.post("/:id/change-request", createChangeRequest);
router.put("/:id/change-request", ownerOnly, resolveChangeRequest);
router.get("/:id", getAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", ownerOnly, deleteAppointment);

module.exports = router;
