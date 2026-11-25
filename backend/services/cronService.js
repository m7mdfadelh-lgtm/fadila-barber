const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const BusinessSettings = require('../models/BusinessSettings');
const pushService = require('./pushService');
const { getAppointmentInstant, formatJerusalemDate, getJerusalemDateString, jerusalemDateTimeToUtc } = require('../utils/timeZone');

class CronService {
  start() {
    if (this.task) return;
    this.task = cron.schedule('* * * * *', () => this.checkReminders(), { timezone: 'Asia/Jerusalem' });
    this.dailyReportTask = cron.schedule('0 9 * * *', () => this.sendDailyReport(), { timezone: 'Asia/Jerusalem' });
    this.inactiveCustomerReportTask = cron.schedule('0 9 * * 0', () => this.sendBiweeklyCustomerReport(), { timezone: 'Asia/Jerusalem' });
    this.checkReminders();
  }

  stop() {
    if (this.task) this.task.stop();
    if (this.dailyReportTask) this.dailyReportTask.stop();
    if (this.inactiveCustomerReportTask) this.inactiveCustomerReportTask.stop();
    this.task = null;
    this.dailyReportTask = null;
    this.inactiveCustomerReportTask = null;
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

  async sendBiweeklyCustomerReport() {
    if (this.inactiveCustomerReportRunning) return;
    this.inactiveCustomerReportRunning = true;
    try {
      const now = new Date();
      const reportDate = getJerusalemDateString(now);
      const settings = await BusinessSettings.findOne();
      if (!settings) throw new Error('Business settings are not initialized');
      if (settings.inactiveCustomerReportSentAt) {
        const lastReportDate = getJerusalemDateString(settings.inactiveCustomerReportSentAt);
        const dateNumber = (value) => Date.parse(`${value}T00:00:00Z`);
        if (dateNumber(reportDate) - dateNumber(lastReportDate) < 14 * 24 * 60 * 60 * 1000) return;
      }

      const owners = await User.find({ role: 'owner', active: true }).select('_id').lean();
      if (!owners.length) throw new Error('No active owner accounts are available for the customer report');
      const ownerIds = owners.map((owner) => owner._id);
      const customers = await User.find({ role: 'customer' }).select('_id name phone').lean();
      const customerIds = customers.map((customer) => customer._id);
      const customerPhones = [...new Set(customers.map((customer) => customer.phone).filter(Boolean))];
      const recentCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const [everBookedIds, everBookedPhones, recentBookedIds, recentBookedPhones] = await Promise.all([
        Appointment.distinct('customer', { customer: { $in: customerIds } }),
        Appointment.distinct('customerPhone', { customerPhone: { $in: customerPhones } }),
        Appointment.distinct('customer', { customer: { $in: customerIds }, createdAt: { $gte: recentCutoff, $lte: now } }),
        Appointment.distinct('customerPhone', { customerPhone: { $in: customerPhones }, createdAt: { $gte: recentCutoff, $lte: now } })
      ]);
      const asIds = (values) => new Set(values.filter(Boolean).map(String));
      const everBooked = asIds(everBookedIds);
      const everBookedByPhone = new Set(everBookedPhones.filter(Boolean).map(String));
      const recentBooked = asIds(recentBookedIds);
      const recentBookedByPhone = new Set(recentBookedPhones.filter(Boolean).map(String));
      const returningCustomers = [];
      const neverBookedCustomers = [];

      for (const customer of customers) {
        const id = String(customer._id);
        const phone = String(customer.phone || '');
        const bookedRecently = recentBooked.has(id) || (phone && recentBookedByPhone.has(phone));
        if (bookedRecently) continue;
        const bookedBefore = everBooked.has(id) || (phone && everBookedByPhone.has(phone));
        (bookedBefore ? returningCustomers : neverBookedCustomers).push(customer);
      }

      const reportSections = [
        { key: 'returning', heading: `לקוחות שהזמינו בעבר ולא הזמינו ב־14 הימים האחרונים (${returningCustomers.length})`, customers: returningCustomers },
        { key: 'never', heading: `לקוחות שמעולם לא הזמינו (${neverBookedCustomers.length})`, customers: neverBookedCustomers }
      ];
      const detailMessages = [];
      for (const section of reportSections) {
        const lines = section.customers
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'))
          .map((customer) => `${String(customer.name || 'بدون اسم').replace(/\s+/g, ' ').trim()}${customer.phone ? ` — ${customer.phone}` : ''}`);
        if (!lines.length) {
          detailMessages.push({ section, body: `${section.heading}\nلا يوجد عملاء في هذه الفئة.` });
          continue;
        }
        let body = section.heading;
        let chunkIndex = 0;
        for (const line of lines) {
          const nextBody = `${body}\n${line}`;
          if (nextBody.length > 460 && body !== section.heading) {
            detailMessages.push({ section, body, chunkIndex });
            chunkIndex += 1;
            body = `${section.heading} — متابعة`;
          }
          body = `${body}\n${line}`;
        }
        detailMessages.push({ section, body, chunkIndex });
      }

      await Promise.all(detailMessages.map(({ section, body, chunkIndex = 0 }) => pushService.saveMessagesForUsers(ownerIds, {
        title: 'قائمة العملاء — تقرير كل أسبوعين',
        messageBody: body,
        url: './dashboard.html',
        tag: `customer-inactivity-${reportDate}-${section.key}-${chunkIndex}`,
        actionType: 'owner-message'
      })));

      const total = returningCustomers.length + neverBookedCustomers.length;
      await pushService.sendToUsers(ownerIds, {
        title: 'تقرير العملاء كل أسبوعين',
        body: `لا توجد حجوزات جديدة لـ${total} عميلاً خلال آخر 14 يوماً.`,
        messageBody: `تقرير ${reportDate}: ${returningCustomers.length} عملاء حجزوا سابقاً ولم يحجزوا خلال آخر 14 يوماً، و${neverBookedCustomers.length} لم يحجزوا من قبل. أسماء العملاء وأرقامهم موجودة في رسائل الإدارة.`,
        url: './dashboard.html',
        tag: `customer-inactivity-summary-${reportDate}`,
        actionType: 'owner-message'
      });
      settings.inactiveCustomerReportSentAt = now;
      await settings.save();
    } catch (error) {
      console.error('Biweekly customer report failed:', error);
    } finally {
      this.inactiveCustomerReportRunning = false;
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
        if (minutes >= 0 && minutes <= 15 && !appointment.client15MinuteReminderSent) {
          const result = await pushService.sendToUser(appointment.customer, {
            title: 'تذكير بموعدك بعد 15 دقيقة',
            body: `موعدك لـ${appointment.service} اليوم الساعة ${appointment.time} بعد 15 دقيقة`,
            url: './index.html', tag: `client-reminder-15-${appointment._id}`
          });
          if (result.sent > 0) appointment.client15MinuteReminderSent = true;
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
