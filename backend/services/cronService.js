const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const whatsappService = require('./whatsappService');

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

    console.log('⏰ WhatsApp reminder cron started (every minute)');

    this.task = cron.schedule('* * * * *', async () => {
      await this.checkReminders();
    });

    // Check once immediately after startup too.
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
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

      await this.sendClientReminders(now, oneHourLater);
      await this.sendOwnerReminders(now, fifteenMinutesLater);
    } catch (error) {
      console.error('❌ Reminder cron error:', error.message);
    } finally {
      this.isChecking = false;
    }
  }

  async sendClientReminders(now, oneHourLater) {
    const appointments = await Appointment.find({
      status: 'confirmed',
      clientReminderSent: { $ne: true },
      upcomingEmailSent: { $ne: true },
      date: {
        $gte: now,
        $lte: oneHourLater
      }
    }).sort({ date: 1 });

    for (const appointment of appointments) {
      const formattedDate = new Date(appointment.date).toLocaleDateString('he-IL');
      const minutesLeft = Math.max(
        0,
        Math.ceil((new Date(appointment.date).getTime() - now.getTime()) / 60000)
      );

      const message = `שלום ${appointment.customerName} 👋\n\nרק תזכורת ⏰\nהתור שלך מתחיל בעוד כשעה או פחות (${minutesLeft} דקות).\n\n📅 ${formattedDate}\n🕐 ${appointment.time}\n✂️/💆‍♂️ ${appointment.service}\n\nמחכים לך 💈\nhttps://fadila-barber.netlify.app/`;

      try {
        await whatsappService.sendMessage(appointment.customerPhone, message);

        appointment.clientReminderSent = true;
        appointment.upcomingEmailSent = true;
        await appointment.save();

        console.log(`✅ Client reminder sent for: ${appointment.customerName}`);
      } catch (error) {
        console.error(
          `❌ Client reminder failed for ${appointment.customerName}:`,
          error.message
        );
      }
    }
  }

  async sendOwnerReminders(now, fifteenMinutesLater) {
    const appointments = await Appointment.find({
      status: 'confirmed',
      ownerReminderSent: { $ne: true },
      date: {
        $gte: now,
        $lte: fifteenMinutesLater
      }
    }).sort({ date: 1 });

    for (const appointment of appointments) {
      const formattedDate = new Date(appointment.date).toLocaleDateString('he-IL');
      const minutesLeft = Math.max(
        0,
        Math.ceil((new Date(appointment.date).getTime() - now.getTime()) / 60000)
      );

      const message = `⏰ תזכורת לבעל העסק\n\nהתור הבא מתחיל בעוד ${minutesLeft} דקות.\n\n👤 שם: ${appointment.customerName}\n📞 טלפון: ${appointment.customerPhone}\n✂️/💆‍♂️ שירות: ${appointment.service}\n📅 תאריך: ${formattedDate}\n🕐 שעה: ${appointment.time}`;

      try {
        await whatsappService.sendMessage(OWNER_WHATSAPP_PHONE, message);

        appointment.ownerReminderSent = true;
        await appointment.save();

        console.log(`✅ Owner reminder sent for: ${appointment.customerName}`);
      } catch (error) {
        console.error(
          `❌ Owner reminder failed for ${appointment.customerName}:`,
          error.message
        );
      }
    }
  }
}

module.exports = new CronService();
