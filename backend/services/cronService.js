const cron = require("node-cron");
const Appointment = require("../models/Appointment");
const whatsappService = require("./whatsappService");
const emailService = require("./emailService");

class CronService {

  start() {
    console.log("⏰ Reminder cron started (every 5 minutes)");

    // רץ כל 5 דקות
    cron.schedule("*/5 * * * *", async () => {
      await this.checkReminders();
    });
  }

  async checkReminders() {
    try {

      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60000);

      // חיפוש תורים שמתחילים בין עכשיו לשעה קדימה
const appointments = await Appointment.find({
  upcomingEmailSent: false,
  status: "confirmed",
  date: {
    $gte: now,
    $lte: oneHourLater
  }
});

      if (appointments.length === 0) return;

      for (const appointment of appointments) {

        const formattedDate = new Date(appointment.date).toLocaleDateString("he-IL");

        /* =========================
           WhatsApp Reminder
        ========================== */

        await whatsappService.sendMessage(
          appointment.customerPhone,
          `שלום ${appointment.customerName} 👋

רק תזכורת ⏰
יש לך תור בקרוב!

📅 ${formattedDate}
🕐 ${appointment.time}
✂️/💆‍♂️ ${appointment.service}

מחכים לך 💈
https://fadila-barber.netlify.app/`
        );

        /* =========================
           Email Reminder To Owner
        ========================== */

appointment.upcomingEmailSent = true;
await appointment.save();
        console.log("✅ Reminder sent for:", appointment.customerName);
      }

    } catch (error) {
      console.error("❌ Reminder cron error:", error.message);
    }
  }
}

module.exports = new CronService();