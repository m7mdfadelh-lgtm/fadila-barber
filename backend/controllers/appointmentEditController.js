const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const whatsappService = require('../services/whatsappService');
const { withWhatsAppFooter } = require('../utils/whatsappMessage');
const {
  jerusalemDateTimeToUtc,
  getAppointmentInstant,
  getJerusalemDateString,
  formatJerusalemDate
} = require('../utils/timeZone');

const ALLOWED_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];

function buildChangeList(previous, next) {
  const changes = [];

  if (previous.customerName !== next.customerName) {
    changes.push(`👤 שם: ${next.customerName}`);
  }

  if (previous.service !== next.service) {
    changes.push(`✂️/💆‍♂️ שירות: ${next.service}`);
  }

  if (previous.date !== next.date) {
    changes.push(`📅 תאריך: ${next.formattedDate}`);
  }

  if (previous.time !== next.time) {
    changes.push(`🕐 שעה: ${next.time}`);
  }

  if (Number(previous.duration) !== Number(next.duration)) {
    changes.push(`⏳ משך: ${next.duration} דקות`);
  }

  if (previous.status !== next.status) {
    changes.push(`📌 סטטוס: ${next.status}`);
  }

  return changes;
}

function buildOwnerNoteSection(notes) {
  const cleanNote = String(notes || '').trim();

  if (!cleanNote) {
    return '';
  }

  return `\n\n📝 *הערה*:\n${cleanNote}`;
}

function buildClientUpdateMessage(appointment, changes) {
  const noteSection = buildOwnerNoteSection(appointment.notes);

  if (appointment.status === 'cancelled') {
    return withWhatsAppFooter(
      `שלום ${appointment.customerName} 👋\n\n*התור שלך בוטל על ידי פדילה ברבר*.\n\n📅 ${formatJerusalemDate(new Date(appointment.date))}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}${noteSection}\n\nלפרטים נוספים ניתן ליצור קשר עם העסק.`
    );
  }

  return withWhatsAppFooter(
    `שלום ${appointment.customerName} 👋\n\n*פדילה ברבר עדכן את התור שלך* ✏️\n\nהשינויים שבוצעו:\n${changes.join('\n')}\n\nפרטי התור המעודכנים:\n📅 ${formatJerusalemDate(new Date(appointment.date))}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n⏳ ${appointment.duration} דקות\n📌 ${appointment.status}${noteSection}\n\nמחכים לך 💈`
  );
}

exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'התור לא נמצא' });
    }

    const previous = {
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      service: appointment.service,
      date: getJerusalemDateString(new Date(appointment.date)),
      time: appointment.time,
      duration: Number(appointment.duration),
      status: appointment.status,
      notes: appointment.notes || ''
    };

    const customerName = String(req.body.customerName ?? appointment.customerName).trim();
    const customerPhone = String(req.body.customerPhone ?? appointment.customerPhone).replace(/\D/g, '');
    const service = String(req.body.service ?? appointment.service).trim();
    const time = String(req.body.time ?? appointment.time).trim();
    const status = String(req.body.status ?? appointment.status);
    const notes = String(req.body.notes ?? appointment.notes ?? '').trim();

    let dateString = req.body.date;
    if (!dateString) {
      dateString = getJerusalemDateString(new Date(appointment.date));
    }

    const duration = Number(req.body.duration ?? appointment.duration);

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

    if (notes.length > 500) {
      return res.status(400).json({ success: false, error: 'ההערה ארוכה מדי' });
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

    const next = {
      customerName,
      customerPhone,
      service,
      date: dateString,
      formattedDate: formatJerusalemDate(newStart),
      time,
      duration,
      status,
      notes
    };

    const changes = buildChangeList(previous, next);
    const phoneChanged = previous.customerPhone !== customerPhone;
    const notesChanged = previous.notes !== next.notes;
    const hasMeaningfulChanges = changes.length > 0 || phoneChanged || notesChanged;

    const scheduleChanged =
      previous.time !== time ||
      previous.duration !== duration ||
      previous.date !== dateString;

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

    let whatsappNotificationSent = false;
    let whatsappNotificationError = null;

    if (hasMeaningfulChanges) {
      try {
        const messageChanges = changes.length > 0
          ? changes
          : ['ℹ️ פרטי התור עודכנו על ידי העסק'];

        await whatsappService.sendMessage(
          appointment.customerPhone,
          buildClientUpdateMessage(appointment, messageChanges)
        );

        whatsappNotificationSent = true;
        console.log(`✅ Appointment update WhatsApp sent to ${appointment.customerName}`);
      } catch (error) {
        whatsappNotificationError = error.message;
        console.error(
          `❌ Appointment update WhatsApp failed for ${appointment.customerName}:`,
          error.message
        );
      }
    }

    return res.json({
      success: true,
      data: appointment,
      whatsappNotificationSent,
      whatsappNotificationError
    });
  } catch (error) {
    console.error('Appointment update error:', error);
    return res.status(500).json({ success: false, error: 'שגיאה בעדכון התור' });
  }
};
