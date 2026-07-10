const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const whatsappService = require('../services/whatsappService');
const {
  jerusalemDateTimeToUtc,
  formatJerusalemDate
} = require('../utils/timeZone');

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

    const dayStart = jerusalemDateTimeToUtc(date, '00:00');
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const existingAppointments = await Appointment.find({
      date: { $gte: dayStart, $lt: nextDay },
      status: { $ne: 'cancelled' }
    });

    const hasConflict = existingAppointments.some((existing) => {
      const existingStart = new Date(existing.date);
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

    whatsappService.sendMessage(
      appointment.customerPhone,
      `שלום ${appointment.customerName} 👋\n\nהתור שלך נקבע בהצלחה ✅\n📅 ${formatJerusalemDate(appointmentDateTime)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈\nhttps://fadila-barber.netlify.app/`
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