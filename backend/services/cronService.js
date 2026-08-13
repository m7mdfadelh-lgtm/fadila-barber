const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const pushService = require('./pushService');
const { getAppointmentInstant, formatJerusalemDate, getJerusalemDateString, jerusalemDateTimeToUtc } = require('../utils/timeZone');

class CronService {
  start() {
    if (this.task) return;
    this.task = cron.schedule('* * * * *', () => this.checkReminders(), { timezone: 'Asia/Jerusalem' });
    this.dailyReportTask = cron.schedule('0 9 * * *', () => this.sendDailyReport(), { timezone: 'Asia/Jerusalem' });
    this.checkReminders();
  }

  stop() {
    if (this.task) this.task.stop();
    if (this.dailyReportTask) this.dailyReportTask.stop();
    this.task = null;
    this.dailyReportTask = null;
  }

  async sendDailyReport() {
    try {
      const date = getJerusalemDateString();
      const start = jerusalemDateTimeToUtc(date, '00:00');
      const nextDate = getJerusalemDateString(new Date(start.getTime() + 30 * 60 * 60 * 1000));
      const end = jerusalemDateTimeToUtc(nextDate, '00:00');
      const appointments = await Appointment.find({
        date: { $gte: start, $lt: end },
        status: { $ne: 'cancelled' }
      }).sort({ time: 1 });
      const confirmed = appointments.filter((item) => item.status === 'confirmed').length;
      const pending = appointments.filter((item) => item.status === 'pending').length;
      const schedule = appointments.map((item) => `${item.time} — ${item.customerName}، ${item.service}`).join('\n');
      const summary = appointments.length
        ? `ملخص مواعيد اليوم: ${appointments.length} مواعيد (${confirmed} مؤكدة${pending ? `، ${pending} بانتظار الموافقة` : ''}).\n${schedule}`
        : 'لا توجد مواعيد مسجلة لهذا اليوم.';
      await pushService.sendToOwners({
        title: 'تقرير اليوم',
        body: 'تقرير اليوم جاهز، ادخل إلى الرسائل لرؤيته',
        messageBody: summary.slice(0, 500),
        url: './dashboard.html',
        tag: `daily-report-${date}`
      });
    } catch (error) {
      console.error('Daily report cron failed:', error);
    }
  }

  async checkReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const appointments = await Appointment.find({
        status: 'confirmed',
        date: { $gte: now, $lte: new Date(now.getTime() + 61 * 60000) }
      });
      for (const appointment of appointments) {
        const instant = getAppointmentInstant(appointment);
        const minutes = Math.ceil((instant - now) / 60000);
        if (minutes >= 0 && minutes <= 60 && !appointment.clientReminderSent) {
          const result = await pushService.sendToUser(appointment.customer, {
            title: 'موعدك يقترب',
            body: `موعد ${appointment.service} اليوم الساعة ${appointment.time} (بعد ${minutes} دقيقة)`,
            url: './index.html', tag: `client-reminder-${appointment._id}`
          });
          if (result.sent > 0) appointment.clientReminderSent = true;
        }
        if (minutes >= 0 && minutes <= 60 && !appointment.ownerHourReminderSent) {
          const result = await pushService.sendToOwners({
            title: 'موعد بعد ساعة',
            body: `${appointment.customerName} — ${appointment.service}, ${formatJerusalemDate(instant)} ${appointment.time}`,
            url: './dashboard.html', tag: `owner-hour-reminder-${appointment._id}`,
            appointmentId: appointment._id
          });
          if (result.sent > 0) appointment.ownerHourReminderSent = true;
        }
        if (minutes >= 0 && minutes <= 15 && !appointment.ownerReminderSent) {
          const result = await pushService.sendToOwners({
            title: 'موعد بعد 15 دقيقة',
            body: `${appointment.customerName} — ${appointment.service}, ${formatJerusalemDate(instant)} ${appointment.time}`,
            url: './dashboard.html', tag: `owner-reminder-${appointment._id}`,
            appointmentId: appointment._id
          });
          if (result.sent > 0) appointment.ownerReminderSent = true;
        }
        await appointment.save();
      }
    } catch (error) { console.error('Reminder cron failed:', error); }
    finally { this.running = false; }
  }
}

module.exports = new CronService();
