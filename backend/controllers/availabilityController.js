const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const BusinessSettings = require('../models/BusinessSettings');
const {
  BUSINESS_TIME_ZONE,
  jerusalemDateTimeToUtc,
  getJerusalemDateString,
  getAppointmentInstant
} = require('../utils/timeZone');

const SLOT_INTERVAL_MINUTES = 5;

function formatJerusalemTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function roundUpToInterval(date, intervalMinutes = SLOT_INTERVAL_MINUTES) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);

  const remainder = rounded.getMinutes() % intervalMinutes;
  if (remainder !== 0) {
    rounded.setMinutes(rounded.getMinutes() + (intervalMinutes - remainder));
  }

  return rounded;
}

function getDayKey(dateString) {
  const dayMap = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];

  const calendarDate = new Date(`${dateString}T12:00:00Z`);
  return dayMap[calendarDate.getUTCDay()];
}

exports.getAvailableSlots = async (req, res) => {
  try {
    const dateString = String(req.params.date || '').slice(0, 10);
    const serviceName = req.query.service;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return res.status(400).json({ success: false, error: 'Invalid date' });
    }

    if (!serviceName) {
      return res.status(400).json({ success: false, error: 'Service is required' });
    }

    const service = await Service.findOne({ name: serviceName });
    if (!service) {
      return res.json({ success: true, availableSlots: [] });
    }

    const requestedDuration = Number(service.duration) || 30;
    const settings = await BusinessSettings.findOne();

    if (!settings || !settings.workingHours) {
      return res.json({ success: true, availableSlots: [] });
    }

    const daySettings = settings.workingHours[getDayKey(dateString)];
    if (!daySettings || !daySettings.enabled) {
      return res.json({ success: true, availableSlots: [] });
    }

    const workStart = jerusalemDateTimeToUtc(dateString, daySettings.start);
    const workEnd = jerusalemDateTimeToUtc(dateString, daySettings.end);
    const startOfDay = jerusalemDateTimeToUtc(dateString, '00:00');
    const endOfDay = jerusalemDateTimeToUtc(dateString, '23:59');
    endOfDay.setSeconds(59, 999);

    if ([workStart, workEnd, startOfDay, endOfDay].some((value) => Number.isNaN(value.getTime()))) {
      return res.status(500).json({
        success: false,
        error: 'Invalid business-hours configuration'
      });
    }

    const existingAppointments = await Appointment.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'cancelled' }
    }).sort({ date: 1 });

    const appointmentRanges = existingAppointments
      .map((appointment) => {
        const start = getAppointmentInstant(appointment);
        const end = new Date(start.getTime() + (Number(appointment.duration) || 30) * 60000);
        return { start, end };
      })
      .filter((range) => !Number.isNaN(range.start.getTime()));

    const breakRanges = (daySettings.breaks || [])
      .map((breakItem) => ({
        start: jerusalemDateTimeToUtc(dateString, breakItem.start),
        end: jerusalemDateTimeToUtc(dateString, breakItem.end)
      }))
      .filter((range) =>
        !Number.isNaN(range.start.getTime()) &&
        !Number.isNaN(range.end.getTime())
      );

    const blockedRanges = [...appointmentRanges, ...breakRanges]
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const now = new Date();
    const isToday = dateString === getJerusalemDateString(now);

    const availableSlots = [];
    let current = new Date(workStart);

    if (isToday && current <= now) {
      current = roundUpToInterval(now);
    }

    while (current < workEnd) {
      const slotStart = new Date(current);
      const slotEnd = new Date(slotStart.getTime() + requestedDuration * 60000);

      // The complete service must finish before or exactly at closing time.
      if (slotEnd > workEnd) {
        break;
      }

      const conflict = blockedRanges.find(
        (range) => slotStart < range.end && slotEnd > range.start
      );

      if (!conflict) {
        availableSlots.push(formatJerusalemTime(slotStart));
      }

      current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES);
    }

    return res.json({
      success: true,
      availableSlots,
      timeZone: BUSINESS_TIME_ZONE,
      serverNow: now.toISOString(),
      businessNow: new Intl.DateTimeFormat('he-IL', {
        timeZone: BUSINESS_TIME_ZONE,
        dateStyle: 'short',
        timeStyle: 'medium'
      }).format(now)
    });
  } catch (error) {
    console.error('Error in Jerusalem-time availability:', error);
    return res.status(500).json({
      success: false,
      error: 'שגיאה בבדיקת זמינות'
    });
  }
};
