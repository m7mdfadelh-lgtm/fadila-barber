const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const BusinessSettings = require('../models/BusinessSettings');
const whatsappService = require('../services/whatsappService');
const { withWhatsAppFooter } = require('../utils/whatsappMessage');
const {
  jerusalemDateTimeToUtc,
  formatJerusalemDate,
  getAppointmentInstant
} = require('../utils/timeZone');

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

exports.createAppointment = async (req, res) => {
  try {
    const { customerName, customerPhone, service, date, time } = req.body;

    if (!customerName || !customerPhone || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'כל השדות הם חובה'
      });
    }

    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) {
      return res.status(400).json({
        success: false,
        error: 'השירות המבוקש לא נמצא'
      });
    }

    if (!/^05\d{8}$/.test(customerPhone)) {
      return res.status(400).json({
        success: false,
        error: 'מספר טלפון לא תקין (05XXXXXXXX)'
      });
    }

    const appointmentDateTime = jerusalemDateTimeToUtc(date, time);

    if (Number.isNaN(appointmentDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'תאריך או שעה לא תקינים'
      });
    }

    if (appointmentDateTime <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'לא ניתן לקבוע תור לזמן שעבר'
      });
    }

    const duration = Number(serviceDoc.duration) || 30;
    const requestedEnd = new Date(appointmentDateTime.getTime() + duration * 60000);

    const settings = await BusinessSettings.findOne();
    const daySettings = settings?.workingHours?.[getDayKey(date)];

    if (!daySettings || !daySettings.enabled) {
      return res.status(400).json({
        success: false,
        error: 'העסק סגור ביום שנבחר'
      });
    }

    const workStart = jerusalemDateTimeToUtc(date, daySettings.start);
    const workEnd = jerusalemDateTimeToUtc(date, daySettings.end);

    if (appointmentDateTime < workStart || requestedEnd > workEnd) {
      return res.status(400).json({
        success: false,
        error: 'התור חייב להתחיל ולהסתיים בתוך שעות הפעילות'
      });
    }

    const breakConflict = (daySettings.breaks || []).some((breakItem) => {
      const breakStart = jerusalemDateTimeToUtc(date, breakItem.start);
      const breakEnd = jerusalemDateTimeToUtc(date, breakItem.end);
      return appointmentDateTime < breakEnd && requestedEnd > breakStart;
    });

    if (breakConflict) {
      return res.status(409).json({
        success: false,
        error: 'השעה שנבחרה נמצאת בזמן הפסקה'
      });
    }

    const dayStart = jerusalemDateTimeToUtc(date, '00:00');
    const dayEnd = jerusalemDateTimeToUtc(date, '23:59');
    dayEnd.setSeconds(59, 999);

    const existingAppointments = await Appointment.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: 'cancelled' }
    });

    const hasConflict = existingAppointments.some((existing) => {
      const existingStart = getAppointmentInstant(existing);
      const existingEnd = new Date(
        existingStart.getTime() + (Number(existing.duration) || 30) * 60000
      );

      return appointmentDateTime < existingEnd && requestedEnd > existingStart;
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        error: 'השעה שנבחרה אינה פנויה'
      });
    }

    const appointment = await Appointment.create({
      customerName,
      customerPhone,
      service,
      duration,
      date: appointmentDateTime,
      time,
      status: 'confirmed',
      clientReminderSent: false,
      ownerReminderSent: false,
      upcomingEmailSent: false
    });

    res.status(201).json({
      success: true,
      message: 'התור נקבע בהצלחה!',
      data: appointment
    });

    const confirmationMessage = withWhatsAppFooter(
      `שלום ${appointment.customerName} 👋\n\nהתור שלך נקבע בהצלחה ✅\n📅 ${formatJerusalemDate(appointmentDateTime)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈`
    );

    whatsappService.sendMessage(
      appointment.customerPhone,
      confirmationMessage
    ).catch((error) => {
      console.error('❌ Background booking confirmation WhatsApp failed:', error.message);
    });
  } catch (error) {
    console.error('שגיאה ביצירת תור:', error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'שגיאת שרת פנימית'
      });
    }
  }
};
