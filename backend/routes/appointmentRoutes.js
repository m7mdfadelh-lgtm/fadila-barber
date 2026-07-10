const express = require("express");
const router = express.Router();

const {
  getAllAppointments,
  getAppointment,
  updateAppointment,
  deleteAppointment
} = require("../controllers/appointmentController");

const {
  createAppointment
} = require("../controllers/bookingController");

const {
  getAvailableSlots
} = require("../controllers/availabilityController");

router.post("/", createAppointment);
router.get("/available/:date", getAvailableSlots);

router.get("/", getAllAppointments);
router.get("/:id", getAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", deleteAppointment);

module.exports = router;