const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const {
  jerusalemDateTimeToUtc,
  getAppointmentInstant,
  getJerusalemDateString
} = require('../utils/timeZone');

const ALLOWED_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];

exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'התור לא נמצא' });
    }

    const customerName = String(req.body.customerName ?? appointment.customerName).trim();
    const customerPhone = String(req.body.customerPhone ?? appointment.customerPhone).replace(/\D/g, '');
    const service = String(req.body.service ?? appointment.service).trim();
    const time = String(req.body.time ?? appointment.time).trim();
    const status = String(req.body.status ?? appointment.status);
    const notes = req.body.notes ?? appointment.notes;

    let dateString = req.body.date;
    if (!dateString) {
      dateString = getJerusalemDateString(new Date(appointment.date));
    }

    let duration = Number(req.body.duration ?? appointment.duration);

    if (!customerName || !/^05\d{8}$/.test(customerPhone)) {
      return res.status(400).json({ success: false, error: 'שם או מספר טלפון לא תקינים' });
    }

    if (!/^([0-1]?\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ success: false, error: 'שעה לא תקינה' });
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'סטטוס לא תקין' });
    }

    if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
      return res.status(400).json({ success: false, error: 'משך התור חייב להיות בין 5 ל-480 דקות' });
    }

    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) {
      return res.status(400).json({ success: false, error: 'השירות לא נמצא' });
    }

    const newStart = jerusalemDateTimeToUtc(dateString, time);
    if (Number.isNaN(newStart.getTime())) {
      return res.status(400).json({ success: false, error: 'תאריך או שעה לא תקינים' });
    }

    const newEnd = new Date(newStart.getTime() + duration * 60000);

    if (status !== 'cancelled') {
      const nearbyAppointments = await Appointment.find({
        _id: { $ne: appointment._id },
        status: { $ne: 'cancelled' },
        date: {
          $gte: new Date(newStart.getTime() - 24 * 60 * 60 * 1000),
          $lte: new Date(newStart.getTime() + 24 * 60 * 60 * 1000)
        }
      });

      const conflict = nearbyAppointments.find((other) => {
        const otherStart = getAppointmentInstant(other);
        const otherEnd = new Date(otherStart.getTime() + (Number(other.duration) || 30) * 60000);
        return newStart < otherEnd && newEnd > otherStart;
      });

      if (conflict) {
        return res.status(409).json({
          success: false,
          error: `התור מתנגש עם תור של ${conflict.customerName} בשעה ${conflict.time}`
        });
      }
    }

    const scheduleChanged =
      appointment.time !== time ||
      Number(appointment.duration) !== duration ||
      getJerusalemDateString(new Date(appointment.date)) !== dateString;

    appointment.customerName = customerName;
    appointment.customerPhone = customerPhone;
    appointment.service = service;
    appointment.duration = duration;
    appointment.date = newStart;
    appointment.time = time;
    appointment.status = status;
    appointment.notes = notes;

    if (scheduleChanged) {
      appointment.clientReminderSent = false;
      appointment.ownerReminderSent = false;
      appointment.upcomingEmailSent = false;
    }

    await appointment.save();

    return res.json({ success: true, data: appointment });
  } catch (error) {
    console.error('Appointment update error:', error);
    return res.status(500).json({ success: false, error: 'שגיאה בעדכון התור' });
  }
};
