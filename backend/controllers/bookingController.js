const jwt = require('jsonwebtoken');
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

const OWNER_WHATSAPP_PHONE = process.env.OWNER_WHATSAPP_PHONE || '0503172506';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

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

function isAuthenticatedAdmin(req) {
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return false;

    const token = authorization.slice(7).trim();
    if (!token) return false;

    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

async function sendAndTrack(phone, message) {
  const result = await whatsappService.sendMessage(phone, message);
  return result?.success === true;
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

    const createdByAdmin = isAuthenticatedAdmin(req);
    const initialStatus = createdByAdmin ? 'confirmed' : 'pending';
    const now = new Date();

    const appointment = await Appointment.create({
      customerName: String(customerName).trim(),
      customerPhone,
      service,
      duration,
      date: appointmentDateTime,
      time,
      status: initialStatus,
      approvalRequestedAt: createdByAdmin ? null : now,
      approvalDecisionAt: createdByAdmin ? now : null,
      approvalDecision: createdByAdmin ? 'approved' : null,
      clientReminderSent: false,
      ownerReminderSent: false,
      upcomingEmailSent: false
    });

    res.status(201).json({
      success: true,
      message: createdByAdmin
        ? 'התור נקבע ואושר בהצלחה!'
        : 'בקשת התור נשלחה וממתינה לאישור בעל העסק',
      data: appointment
    });

    if (createdByAdmin) {
      const confirmationMessage = withWhatsAppFooter(
        `שלום ${appointment.customerName} 👋\n\nהתור שלך נקבע ואושר בהצלחה ✅\n📅 ${formatJerusalemDate(appointmentDateTime)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n⏳ ${appointment.duration} דקות\n\nמחכים לך 💈`
      );

      sendAndTrack(appointment.customerPhone, confirmationMessage)
        .then((sent) => sent && Appointment.updateOne(
          { _id: appointment._id },
          { $set: { clientBookingNotificationSent: true } }
        ))
        .catch((error) => {
          console.error('❌ Manual booking confirmation WhatsApp failed:', error.message);
        });

      return;
    }

    const requestCode = String(appointment._id).slice(-6).toUpperCase();

    const waitingMessage = withWhatsAppFooter(
      `שלום ${appointment.customerName} 👋\n\nבקשת התור שלך התקבלה וממתינה לאישור בעל העסק ⏳\n\n📅 ${formatJerusalemDate(appointmentDateTime)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n⏳ ${appointment.duration} דקות\n\nנשלח אליך עדכון מיד לאחר שבעל העסק יאשר או ידחה את הבקשה.`
    );

    const ownerApprovalMessage = withWhatsAppFooter(
      `📅 בקשת תור חדשה ממתינה לאישור\n\n🔢 מספר בקשה: ${requestCode}\n👤 שם: ${appointment.customerName}\n📞 טלפון: ${appointment.customerPhone}\n✂️/💆‍♂️ שירות: ${appointment.service}\n⏳ משך: ${appointment.duration} דקות\n📅 תאריך: ${formatJerusalemDate(appointmentDateTime)}\n🕐 שעה: ${appointment.time}\n\nהשב 1 כדי לאשר את התור ✅\nהשב 2 כדי לדחות את התור ❌\n\nהתגובה תחול על בקשת התור הממתינה הוותיקה ביותר.`
    );

    Promise.all([
      sendAndTrack(appointment.customerPhone, waitingMessage)
        .then((sent) => sent && Appointment.updateOne(
          { _id: appointment._id },
          { $set: { clientBookingNotificationSent: true } }
        )),
      sendAndTrack(OWNER_WHATSAPP_PHONE, ownerApprovalMessage)
        .then((sent) => sent && Appointment.updateOne(
          { _id: appointment._id },
          { $set: { ownerBookingNotificationSent: true } }
        ))
    ]).catch((error) => {
      console.error('❌ Booking approval notification failed:', error.message);
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
