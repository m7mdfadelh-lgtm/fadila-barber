const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const BusinessSettings = require('../models/BusinessSettings');

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

exports.getAvailableSlots = async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const serviceName = req.query.service;

    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date'
      });
    }

    if (!serviceName) {
      return res.status(400).json({
        success: false,
        error: 'Service is required'
      });
    }

    const service = await Service.findOne({ name: serviceName });

    if (!service) {
      return res.json({
        success: true,
        availableSlots: []
      });
    }

    const requestedDuration = Number(service.duration) || 30;
    const settings = await BusinessSettings.findOne();

    if (!settings || !settings.workingHours) {
      return res.json({
        success: true,
        availableSlots: []
      });
    }

    const dayMap = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ];

    const daySettings = settings.workingHours[dayMap[date.getDay()]];

    if (!daySettings || !daySettings.enabled) {
      return res.json({
        success: true,
        availableSlots: []
      });
    }

    const [workStartHour, workStartMinute] = daySettings.start.split(':').map(Number);
    const [workEndHour, workEndMinute] = daySettings.end.split(':').map(Number);

    const workStart = new Date(date);
    workStart.setHours(workStartHour, workStartMinute, 0, 0);

    const workEnd = new Date(date);
    workEnd.setHours(workEndHour, workEndMinute, 0, 0);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await Appointment.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'cancelled' }
    }).sort({ date: 1 });

    const appointmentRanges = existingAppointments.map((appointment) => {
      const start = new Date(appointment.date);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + (Number(appointment.duration) || 30));
      return { start, end };
    });

    const breakRanges = (daySettings.breaks || []).map((breakItem) => {
      const start = new Date(date);
      const end = new Date(date);

      const [breakStartHour, breakStartMinute] = breakItem.start.split(':').map(Number);
      const [breakEndHour, breakEndMinute] = breakItem.end.split(':').map(Number);

      start.setHours(breakStartHour, breakStartMinute, 0, 0);
      end.setHours(breakEndHour, breakEndMinute, 0, 0);

      return { start, end };
    });

    const blockedRanges = [...appointmentRanges, ...breakRanges]
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = startOfDay.getTime() === today.getTime();

    const availableSlots = [];
    let current = new Date(workStart);

    while (current < workEnd) {
      if (isToday && current <= now) {
        current = new Date(now);
        current.setSeconds(0, 0);
      }

      const slotStart = new Date(current);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + requestedDuration);

      if (slotEnd > workEnd) {
        break;
      }

      const conflict = blockedRanges.find(
        (range) => slotStart < range.end && slotEnd > range.start
      );

      if (conflict) {
        // Move directly to the exact ending time of the blocking appointment.
        // Example: 13:30 + 40 minutes => next candidate starts at 14:10.
        current = new Date(conflict.end);
        continue;
      }

      availableSlots.push(formatTime(slotStart));

      // The next available candidate follows the selected service duration.
      current = new Date(slotEnd);
    }

    return res.json({
      success: true,
      availableSlots
    });
  } catch (error) {
    console.error('Error in duration-based availability:', error);
    return res.status(500).json({
      success: false,
      error: 'שגיאה בבדיקת זמינות'
    });
  }
};
