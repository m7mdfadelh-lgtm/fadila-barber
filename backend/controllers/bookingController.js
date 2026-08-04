const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const User = require('../models/User');
const BusinessSettings = require('../models/BusinessSettings');
const pushService = require('../services/pushService');
const { jerusalemDateTimeToUtc, getAppointmentInstant, formatJerusalemDate } = require('../utils/timeZone');

const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayKey = (date) => dayKeys[new Date(`${date}T12:00:00Z`).getUTCDay()];

exports.createAppointment = async (req, res) => {
  try {
    const { service, date, time } = req.body;
    let customer = req.user;
    if (req.user.role === 'owner') {
      customer = await User.findOne({ _id: req.body.customerId, role: 'customer', active: true });
      if (!customer) return res.status(400).json({ success: false, error: 'يرجى اختيار زبون موجود' });
    }
    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) return res.status(400).json({ success: false, error: 'لم يتم العثور على الخدمة' });
    const start = jerusalemDateTimeToUtc(date, time);
    if (Number.isNaN(start.getTime()) || start <= new Date()) return res.status(400).json({ success: false, error: 'التاريخ أو الساعة غير صالحين' });
    const duration = Number(serviceDoc.duration) || 30;
    const end = new Date(start.getTime() + duration * 60000);
    const settings = await BusinessSettings.findOne();
    const hours = settings?.workingHours?.[dayKey(date)];
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
    const status = req.user.role === 'owner' ? 'confirmed' : 'pending';
    const appointment = await Appointment.create({
      customer: customer._id, customerName: customer.name, customerPhone: customer.phone,
      service, duration, date: start, time, status,
      approvalRequestedAt: status === 'pending' ? new Date() : null,
      approvalDecisionAt: status === 'confirmed' ? new Date() : null,
      approvalDecision: status === 'confirmed' ? 'approved' : null
    });
    res.status(201).json({ success: true, data: appointment, message: status === 'pending' ? 'الطلب بانتظار الموافقة' : 'تم تحديد الموعد' });
    if (status === 'pending') {
      pushService.sendToOwners({ title: 'طلب موعد جديد', body: `${customer.name} طلب موعد ${service} بتاريخ ${formatJerusalemDate(start)} الساعة ${time}`, url: './dashboard.html', tag: `new-${appointment._id}` });
    } else {
      pushService.sendToUser(customer._id, { title: 'تم تحديد موعد لك', body: `${service}، ${formatJerusalemDate(start)} الساعة ${time}`, url: './index.html', tag: `created-${appointment._id}` });
    }
  } catch (error) {
    console.error('Appointment creation failed:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الموعد' });
  }
};
