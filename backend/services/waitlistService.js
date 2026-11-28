const WaitlistEntry = require('../models/WaitlistEntry');
const pushService = require('./pushService');
const { getJerusalemDateString, formatJerusalemDate } = require('../utils/timeZone');

async function notifyForReleasedAppointment(appointment) {
  const date = getJerusalemDateString(appointment.date);
  const entries = await WaitlistEntry.find({
    date,
    $or: [{ service: appointment.service }, { service: '*' }]
  });
  for (const entry of entries) {
    try {
      const result = await pushService.sendToUser(entry.customer, {
        title: 'התפנה תור ביום שביקשת',
        body: `${formatJerusalemDate(appointment.date)} — התפנתה שעה ${appointment.time}. ادخل لحجز ${appointment.service} بسرعة.`,
        url: `./index.html?waitlistService=${encodeURIComponent(appointment.service)}&waitlistDate=${encodeURIComponent(date)}&waitlistTime=${encodeURIComponent(appointment.time)}`,
        tag: `waitlist-${appointment._id}-${entry._id}-${Date.now()}`
      });
      if (result.sent > 0) {
        entry.notifiedAt = new Date();
        await entry.save();
      }
    } catch (error) {
      console.error('Waitlist notification failed:', error);
    }
  }
}

module.exports = { notifyForReleasedAppointment };
