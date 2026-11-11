const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const User = require('../models/User');
const BusinessSettings = require('../models/BusinessSettings');
const pushService = require('../services/pushService');
const { jerusalemDateTimeToUtc, getAppointmentInstant, formatJerusalemDate } = require('../utils/timeZone');
const { getScheduleForDate } = require('../utils/businessHours');

exports.createAppointment = async (req, res) => {
  try {
    const { service, date, time } = req.body;
    const notes = String(req.body.notes || '').trim();
    if (notes.length > 500) return res.status(400).json({ success: false, error: 'الملاحظة طويلة جداً' });
    let customerId, customerName, customerPhone;
    if (req.user.role === 'owner' && req.body.oneOff === true) {
      customerName = String(req.body.customerName || '').trim();
      customerPhone = String(req.body.customerPhone || '').replace(/\D/g, '');
      if (customerName.length < 2 || customerName.length > 50) {
        return res.status(400).json({ success: false, error: 'اسم العميل غير صالح' });
      }
      if (!/^05\d{8}$/.test(customerPhone)) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح (05XXXXXXXX)' });
      }
      customerId = null;
    } else if (req.user.role === 'owner') {
      const customer = await User.findOne({ _id: req.body.customerId, role: 'customer', active: true });
      if (!customer) return res.status(400).json({ success: false, error: 'يرجى اختيار زبون موجود أو عميل لمرة واحدة' });
      customerId = customer._id;
      customerName = customer.name;
      customerPhone = customer.phone;
    } else {
      customerId = req.user._id;
      customerName = req.user.name;
      customerPhone = req.user.phone;
    }
    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) return res.status(400).json({ success: false, error: 'لم يتم العثور على الخدمة' });
    const start = jerusalemDateTimeToUtc(date, time);
    if (Number.isNaN(start.getTime()) || start <= new Date()) return res.status(400).json({ success: false, error: 'التاريخ أو الساعة غير صالحين' });
    const duration = Number(serviceDoc.duration) || 30;
    const end = new Date(start.getTime() + duration * 60000);
    const settings = await BusinessSettings.findOne();
    const hours = getScheduleForDate(settings, date);
    if (!hours?.enabled) return res.status(400).json({ success: false, error: 'المحل مغلق في اليوم المختار' });
    const workStart = jerusalemDateTimeToUtc(date, hours.start);
    const workEnd = jerusalemDateTimeToUtc(date, hours.end);
    if (start < workStart || end > workEnd) return res.status(400).json({ success: false, error: 'الموعد خارج ساعات العمل' });
    if ((hours.breaks || []).some((item) => start < jerusalemDateTimeToUtc(date, item.end) && end > jerusalemDateTimeToUtc(date, item.start))) {
      return res.status(409).json({ success: false, error: 'الساعة المختارة تقع ضمن وقت الاستراحة' });
    }
    const nearby = await Appointment.find({ status: { $ne: 'cancelled' }, date: { $gte: new Date(start - 86400000), $lte: new Date(start.getTime() + 86400000) } });
    const conflict = nearby.some((item) => {
      const otherStart = getAppointmentInstant(item);
      const otherEnd = new Date(otherStart.getTime() + (Number(item.duration) || 30) * 60000);
      return start < otherEnd && end > otherStart;
    });
    if (conflict) return res.status(409).json({ success: false, error: 'الساعة المختارة غير متاحة' });
    const status = 'confirmed';
    const appointment = await Appointment.create({
      customer: customerId || null, customerName, customerPhone,
      service, duration, date: start, time, notes, status,
      approvalRequestedAt: status === 'pending' ? new Date() : null,
      approvalDecisionAt: status === 'confirmed' ? new Date() : null,
      approvalDecision: status === 'confirmed' ? 'approved' : null
    });
    res.status(201).json({ success: true, data: appointment, message: 'تم تأكيد الموعد' });
    if (customerId) {
      pushService.sendToUser(customerId, { title: 'تم تأكيد موعدك', body: `${service}، ${formatJerusalemDate(start)} الساعة ${time}`, url: './index.html', tag: `created-${appointment._id}` });
    }
  } catch (error) {
    console.error('Appointment creation failed:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الموعد' });
  }
};
