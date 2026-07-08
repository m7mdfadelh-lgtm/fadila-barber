const Appointment = require('../models/Appointment');
const emailService = require('../services/emailService');
const whatsappService = require("../services/whatsappService");
const BusinessSettings = require("../models/BusinessSettings");
/**
 * 
 * יצירת תור חדש
 * POST /api/appointments
 */
exports.createAppointment = async (req, res) => {
  try {
    const { customerName, customerPhone, service, date, time } = req.body;

    if (!customerName || !customerPhone || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        error: "כל השדות הם חובה"
      });
    }

    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) {
      return res.status(400).json({
        success: false,
        error: "השירות המבוקש לא נמצא"
      });
    }

    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(customerPhone)) {
      return res.status(400).json({
        success: false,
        error: "מספר טלפון לא תקין (05XXXXXXXX)"
      });
    }

    // ✅ יצירת תאריך כולל שעה
    const appointmentDateTime = new Date(`${date}T${time}:00`);

    const now = new Date();
    if (appointmentDateTime < now) {
      return res.status(400).json({
        success: false,
        error: "לא ניתן לקבוע תור לזמן שעבר"
      });
    }

    // בדיקת כפילות
    const existingAppointment = await Appointment.findOne({
      date: appointmentDateTime,
      status: { $ne: "cancelled" }
    });

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        error: "שעה זו תפוסה, אנא בחר שעה אחרת"
      });
    }

    // ✅ שמירה עם שעה אמיתית
    const appointment = await Appointment.create({
      customerName,
      customerPhone,
      service,
      duration: serviceDoc.duration || 30,   
      date: appointmentDateTime,
      time,
      status: "confirmed",
      upcomingEmailSent: false
    });

    // 🚀 הצעד המכריע: מחזירים תשובה מיידית לחלוטין ללקוח בפרלי שניות!
    res.status(201).json({
      success: true,
      message: "התור נקבע בהצלחה!"
    });

    // 🔄 כל השירותים האיטיים רצים עכשיו ברקע בנפרד, מבלי לתקוע את ה-Response
    (async () => {
      try {
        // ✅ WhatsApp אישור (ללא await שיעכב את המשתמש)
        if (whatsappService && typeof whatsappService.sendMessage === 'function') {
          await whatsappService.sendMessage(
            appointment.customerPhone,
            `שלום ${appointment.customerName} 👋\n\nהתור שלך נקבע בהצלחה ✅\n📅 ${appointmentDateTime.toLocaleDateString("he-IL")}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈\nhttps://fadila-barber.netlify.app/`
          );
        }
      } catch (wsErr) {
        console.error("שגיאה שליחת ווטסאפ ברקע:", wsErr.message);
      }

      try {
        // ✅ מייל לבעל העסק (ברקע)
        if (emailService && typeof emailService.sendNewAppointmentEmail === 'function') {
          await emailService.sendNewAppointmentEmail(appointment);
        }
      } catch (mailErr) {
        console.error("שגיאה שליחת מייל ברקע:", mailErr.message);
      }
    })();

  } catch (error) {
    console.error("שגיאה ביצירת תור:", error);
    // הגנה למקרה שהשגיאה קרתה לפני שליחת ה-res
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "שגיאת שרת פנימית"
      });
    }
  }
};

/**
 * קבלת כל התורים
 * GET /api/appointments
 */
const Service = require("../models/Service");

exports.getAvailableSlots = async (req, res) => {
  try {

    const date = new Date(req.params.date);
    const serviceName = req.query.service;

    console.log("==== DEBUG START ====");
    console.log("Date:", date);
    console.log("Service:", serviceName);

    if (!serviceName) {
      return res.status(400).json({
        success: false,
        error: "Service is required"
      });
    }

    const service = await Service.findOne({ name: serviceName });

    if (!service) {
      return res.json({
        success: true,
        availableSlots: []
      });
    }

    const duration = service.duration || 30;

    const dayIndex = date.getDay();
    const dayMap = [
      "sunday","monday","tuesday","wednesday",
      "thursday","friday","saturday"
    ];

    const settings = await BusinessSettings.findOne();
    const daySettings = settings.workingHours[dayMap[dayIndex]];

    if (!daySettings.enabled) {
      return res.json({ success: true, availableSlots: [] });
    }

    const [startHour, startMinute] = daySettings.start.split(":").map(Number);
    const [endHour, endMinute] = daySettings.end.split(":").map(Number);

    const startOfDay = new Date(date);
    startOfDay.setHours(0,0,0,0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23,59,59,999);

    const existingAppointments = await Appointment.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: "cancelled" }
    });

    const availableSlots = [];

    let current = new Date(date);
    current.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(endHour, endMinute, 0, 0);

    while (current < endTime) {

      const slotStart = new Date(current);
      const slotEnd = new Date(current);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);

      if (slotEnd > endTime) break;

      let isAvailable = true;

      /* ===== בדיקת הפסקות ===== */
      if (daySettings.breaks && daySettings.breaks.length > 0) {
        for (const br of daySettings.breaks) {

          const breakStart = new Date(date);
          const breakEnd = new Date(date);

          const [bsh, bsm] = br.start.split(":").map(Number);
          const [beh, bem] = br.end.split(":").map(Number);

          breakStart.setHours(bsh, bsm, 0, 0);
          breakEnd.setHours(beh, bem, 0, 0);

          if (slotStart < breakEnd && slotEnd > breakStart) {
            isAvailable = false;
            break;
          }
        }
      }

      /* ===== בדיקת חפיפה עם תורים ===== */
      for (const appointment of existingAppointments) {

        const appointmentStart = new Date(appointment.date);
        const appointmentDuration = appointment.duration || 30;

        const appointmentEnd = new Date(appointmentStart);
        appointmentEnd.setMinutes(
          appointmentEnd.getMinutes() + appointmentDuration
        );

        if (slotStart < appointmentEnd && slotEnd > appointmentStart) {
          isAvailable = false;
          break;
        }
      }

      /* ===== סינון שעות שעברו היום ===== */
      const now = new Date();
      const today = new Date();
      today.setHours(0,0,0,0);

      if (startOfDay.getTime() === today.getTime() && slotStart <= now) {
        isAvailable = false;
      }

      if (isAvailable) {
        availableSlots.push(slotStart.toTimeString().slice(0,5));
      }

      current.setMinutes(current.getMinutes() + 30);
    }

    console.log("Available slots:", availableSlots);
    console.log("==== DEBUG END ====");

    return res.json({ success: true, availableSlots });

  } catch (error) {
    console.error("Error in getAvailableSlots:", error);
    return res.status(500).json({
      success: false,
      error: "שגיאה בבדיקת זמינות"
    });
  }
};
/**
 * קבלת תור לפי ID
 * GET /api/appointments/:id
 */
exports.getAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'התור לא נמצא'
      });
    }
    
    res.json({
      success: true,
      data: appointment
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת תור:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בטעינת התור'
    });
  }
};

/**
 * עדכון סטטוס תור
 * PUT /api/appointments/:id
 */
exports.updateAppointment = async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status, notes },
      { new: true, runValidators: true }
    );
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'התור לא נמצא'
      });
    }
    
    // שליחת מייל בעת ביטול
    if (status === 'cancelled') {
      await emailService.sendCancellationEmail(appointment, notes);
    }
    
    res.json({
      success: true,
      data: appointment
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון תור:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בעדכון התור'
    });
  }
};

/**
 * מחיקת תור
 * DELETE /api/appointments/:id
 */
exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'התור לא נמצא'
      });
    }
    
    res.json({
      success: true,
      message: 'התור נמחק בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת תור:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה במחיקת התור'
    });
  }
};

exports.getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ date: 1 });
    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "שגיאה בטעינת התורים"
    });
  }
};
/**
 * בדיקת שעות פנויות לתאריך
 * GET /api/appointments/available/:date
 */
// exports.getAvailableSlots = async (req, res) => {
//  try {
//    const date = new Date(req.params.date);
//    const dayOfWeek = date.getDay(); // 0=ראשון, 6=שבת
  
//    // שעות עבודה (ניתן להעביר לקובץ הגדרות)
//    const workingHours = {
//      start: 9, // 09:00
//      end: 19,  // 19:00
//    };
  


//    // קבלת תורים קיימים לתאריך
//    const existingAppointments = await Appointment.find({
//      date: {
//        $gte: new Date(date.setHours(0, 0, 0, 0)),
//        $lt: new Date(date.setHours(23, 59, 59, 999))
//      },
//      status: { $ne: 'cancelled' }
//    }).select('time');
  
//    const takenSlots = existingAppointments.map(apt => apt.time);
  
//    // יצירת כל המשבצות
//    const allSlots = [];
//    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
//      allSlots.push(`${hour.toString().padStart(2, '0')}:00`);
//      allSlots.push(`${hour.toString().padStart(2, '0')}:30`);
//    }
  
//    // סינון משבצות פנויות
//    const availableSlots = allSlots.filter(slot => !takenSlots.includes(slot));
  
//    // גם לסנן שעות שכבר עברו היום
//    const now = new Date();
//    const today = new Date();
//    today.setHours(0, 0, 0, 0);
  
//    let finalSlots = availableSlots;
  
//    if (date.getTime() === today.getTime()) {
//      const currentHour = now.getHours();
//      const currentMinute = now.getMinutes();
    
//      finalSlots = availableSlots.filter(slot => {
//        const [h, m] = slot.split(':').map(Number);
//        return (h > currentHour) || (h === currentHour && m > currentMinute);
//      });
//    }
  
//    res.json({
//      success: true,
//      date: req.params.date,
//      availableSlots: finalSlots
//    });
  
//  } catch (error) {
//    console.error('שגיאה בבדיקת זמינות:', error);
//    res.status(500).json({
//      success: false,
//      error: 'שגיאה בבדיקת זמינות'
//    });
//  }
// };
