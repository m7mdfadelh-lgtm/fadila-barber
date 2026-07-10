const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const whatsappService = require('./whatsappService');
const { withWhatsAppFooter } = require('../utils/whatsappMessage');
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

    console.log('⏰ WhatsApp reminder and retry cron started (every minute, Asia/Jerusalem)');

    this.task = cron.schedule('* * * * *', async () => {
      await this.checkReminders();
    }, {
      timezone: 'Asia/Jerusalem'
    });

    this.checkReminders().catch((error) => {
      console.error('❌ Initial reminder/retry check failed:', error.message);
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
      const retryResult = await whatsappService.processPendingQueue();

      if (retryResult.processed > 0) {
        console.log(
          `🔁 WhatsApp retry queue processed: ${retryResult.processed}, sent: ${retryResult.sent}`
        );
      }

      const now = new Date();

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
      console.error('❌ Reminder/retry cron error:', error.message);
    } finally {
      this.isChecking = false;
    }
  }

  async sendClientReminder(appointment, appointmentInstant, minutesLeft) {
    const message = withWhatsAppFooter(
      `שלום ${appointment.customerName} 👋\n\nרק תזכורת ⏰\nהתור שלך מתחיל בעוד כשעה או פחות (${Math.max(0, minutesLeft)} דקות).\n\n📅 ${formatJerusalemDate(appointmentInstant)}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈`
    );

    try {
      const result = await whatsappService.sendMessage(appointment.customerPhone, message);

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
        `${result.queued ? '📥 Client reminder queued' : '✅ Client reminder sent'} for ` +
        `${appointment.customerName}; ${minutesLeft} minutes left`
      );
    } catch (error) {
      console.error(
        `❌ Client reminder could not be sent or queued for ${appointment.customerName}:`,
        error.message
      );
    }
  }

  async sendOwnerReminder(appointment, appointmentInstant, minutesLeft) {
    const message = withWhatsAppFooter(
      `⏰ תזכורת לבעל העסק\n\nהתור הבא מתחיל בעוד ${Math.max(0, minutesLeft)} דקות.\n\n👤 שם: ${appointment.customerName}\n📞 טלפון: ${appointment.customerPhone}\n✂️/💆‍♂️ שירות: ${appointment.service}\n📅 תאריך: ${formatJerusalemDate(appointmentInstant)}\n🕐 שעה: ${appointment.time}`
    );

    try {
      const result = await whatsappService.sendMessage(OWNER_WHATSAPP_PHONE, message);

      await Appointment.updateOne(
        { _id: appointment._id, ownerReminderSent: { $ne: true } },
        { $set: { ownerReminderSent: true } }
      );

      console.log(
        `${result.queued ? '📥 Owner reminder queued' : '✅ Owner reminder sent'} for ` +
        `${appointment.customerName}; ${minutesLeft} minutes left`
      );
    } catch (error) {
      console.error(
        `❌ Owner reminder could not be sent or queued for ${appointment.customerName}:`,
        error.message
      );
    }
  }
}

module.exports = new CronService();
