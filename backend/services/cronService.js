const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const whatsappService = require('./whatsappService');
const {
  getAppointmentInstant,
  formatJerusalemDate
} = require('../utils/timeZone');

const OWNER_WHATSAPP_PHONE = process.env.OWNER_WHATSAPP_PHONE || '0503172506';

class CronService {
  constructor() {
    this.task = null;
    this.isChecking = false;
  }

  start() {
    if (this.task) {
      console.log('ℹ️ Reminder cron is already running');
      return;
    }

    console.log('⏰ WhatsApp reminder cron started (every minute, Asia/Jerusalem)');

    this.task = cron.schedule('* * * * *', async () => {
      await this.checkReminders();
    }, {
      timezone: 'Asia/Jerusalem'
    });

    this.checkReminders().catch((error) => {
      console.error('❌ Initial reminder check failed:', error.message);
    });
  }

  stop() {
    if (!this.task) return;

    this.task.stop();
    this.task = null;
    console.log('🛑 WhatsApp reminder cron stopped');
  }

  async checkReminders() {
    if (this.isChecking) {
      console.log('ℹ️ Reminder check skipped because the previous check is still running');
      return;
    }

    this.isChecking = true;

    try {
      const now = new Date();

      // Fetch a broad range, then calculate the real appointment instant from
      // the saved calendar date + the explicit HH:mm field in Jerusalem time.
      // This also fixes older records that were saved as if local time were UTC.
      const appointments = await Appointment.find({
        status: 'confirmed',
        date: {
          $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          $lte: new Date(now.getTime() + 48 * 60 * 60 * 1000)
        }
      }).sort({ date: 1 });

      for (const appointment of appointments) {
        const appointmentInstant = getAppointmentInstant(appointment);

        if (Number.isNaN(appointmentInstant.getTime())) {
          console.error(`❌ Invalid appointment time for ${appointment.customerName}`);
          continue;
        }

        const millisecondsLeft = appointmentInstant.getTime() - now.getTime();
        const minutesLeft = Math.ceil(millisecondsLeft / 60000);

        if (millisecondsLeft < 0) continue;

        if (
          minutesLeft <= 60 &&
          appointment.clientReminderSent !== true &&
          appointment.upcomingEmailSent !== true
        ) {
          await this.sendClientReminder(appointment, appointmentInstant, minutesLeft);
        }

        if (minutesLeft <= 15 && appointment.ownerReminderSent !== true) {
          await this.sendOwnerReminder(appointment, appointmentInstant, minutesLeft);
        }
      }
    } catch (error) {
      console.error('❌ Reminder cron error:', error.message);
    } finally {
      this.isChecking = false;
    }
  }

  async sendClientReminder(appointment, appointmentInstant, minutesLeft) {
    const message = `שלום ${appointment.customerName} 👋\n\nרק תזכורת ⏰\nהתור שלך מתחיל בעוד כשעה או פחות (${Math.max(0, minutesLeft)} דקות).\n\n📅 ${formatJerusalemDate(appointmentInstant)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈\nhttps://fadila-barber.netlify.app/`;

    try {
      await whatsappService.sendMessage(appointment.customerPhone, message);

      await Appointment.updateOne(
        { _id: appointment._id, clientReminderSent: { $ne: true } },
        {
          $set: {
            clientReminderSent: true,
            upcomingEmailSent: true
          }
        }
      );

      console.log(
        `✅ Client reminder sent for ${appointment.customerName}; ` +
        `${minutesLeft} minutes left; appointment=${appointmentInstant.toISOString()}`
      );
    } catch (error) {
      console.error(
        `❌ Client reminder failed for ${appointment.customerName}:`,
        error.message
      );
    }
  }

  async sendOwnerReminder(appointment, appointmentInstant, minutesLeft) {
    const message = `⏰ תזכורת לבעל העסק\n\nהתור הבא מתחיל בעוד ${Math.max(0, minutesLeft)} דקות.\n\n👤 שם: ${appointment.customerName}\n📞 טלפון: ${appointment.customerPhone}\n✂️/💆‍♂️ שירות: ${appointment.service}\n📅 תאריך: ${formatJerusalemDate(appointmentInstant)}\n🕐 שעה: ${appointment.time}`;

    try {
      await whatsappService.sendMessage(OWNER_WHATSAPP_PHONE, message);

      await Appointment.updateOne(
        { _id: appointment._id, ownerReminderSent: { $ne: true } },
        { $set: { ownerReminderSent: true } }
      );

      console.log(
        `✅ Owner reminder sent for ${appointment.customerName}; ` +
        `${minutesLeft} minutes left; appointment=${appointmentInstant.toISOString()}`
      );
    } catch (error) {
      console.error(
        `❌ Owner reminder failed for ${appointment.customerName}:`,
        error.message
      );
    }
  }
}

module.exports = new CronService();