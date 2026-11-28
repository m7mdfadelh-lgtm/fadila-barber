const express = require("express");
const router = express.Router();

const {
  getAllAppointments,
  getAppointment,
  deleteAppointment,
  confirmAttendance,
  markCustomerArrived
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
const waitlist = require('../controllers/waitlistController');

router.use(protect);
router.post("/", createAppointment);
router.post('/:id/confirm-attendance', confirmAttendance);
router.post('/:id/arrived', ownerOnly, markCustomerArrived);
router.get("/available/:date", getAvailableSlots);
router.post('/waitlist', waitlist.join);
router.get('/waitlist', waitlist.list);
router.delete('/waitlist/:id', waitlist.remove);

router.get("/", getAllAppointments);
router.post("/:id/change-request", createChangeRequest);
router.put("/:id/change-request", ownerOnly, resolveChangeRequest);
router.get("/:id", getAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", ownerOnly, deleteAppointment);

module.exports = router;
