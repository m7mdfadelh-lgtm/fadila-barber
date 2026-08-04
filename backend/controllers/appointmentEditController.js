const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const pushService = require('../services/pushService');
const { jerusalemDateTimeToUtc, getAppointmentInstant, getJerusalemDateString, formatJerusalemDate } = require('../utils/timeZone');

const allowed = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];

exports.updateAppointment = async (req, res) => {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ success: false, error: 'يمكن لصاحب المحل فقط تحديث موعد' });
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ success: false, error: 'لم يتم العثور على الموعد' });
    const previous = { date: getJerusalemDateString(appointment.date), time: appointment.time, service: appointment.service, status: appointment.status };
    const service = String(req.body.service ?? appointment.service);
    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) return res.status(400).json({ success: false, error: 'لم يتم العثور على الخدمة' });
    const date = String(req.body.date || previous.date);
    const time = String(req.body.time || appointment.time);
    const status = String(req.body.status || appointment.status);
    if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'حالة الموعد غير صالحة' });
    const duration = Number(req.body.duration || serviceDoc.duration);
    const start = jerusalemDateTimeToUtc(date, time);
    const end = new Date(start.getTime() + duration * 60000);
    const others = status === 'cancelled' ? [] : await Appointment.find({ _id: { $ne: appointment._id }, status: { $ne: 'cancelled' }, date: { $gte: new Date(start - 86400000), $lte: new Date(start.getTime() + 86400000) } });
    if (others.some((item) => { const s = getAppointmentInstant(item); return start < new Date(s.getTime() + item.duration * 60000) && end > s; })) {
      return res.status(409).json({ success: false, error: 'الموعد يتعارض مع موعد موجود' });
    }
    Object.assign(appointment, { service, duration, date: start, time, status, notes: String(req.body.notes || '') });
    const scheduleChanged = previous.date !== date || previous.time !== time || previous.service !== service;
    if (scheduleChanged) { appointment.clientReminderSent = false; appointment.ownerReminderSent = false; }
    if (previous.status === 'pending' && ['confirmed', 'cancelled'].includes(status)) {
      appointment.approvalDecision = status === 'confirmed' ? 'approved' : 'rejected';
      appointment.approvalDecisionAt = new Date();
    }
    if (appointment.changeRequest?.status === 'pending') {
      appointment.changeRequest.status = 'adjusted';
      appointment.changeRequest.resolvedAt = new Date();
    }
    await appointment.save();
    let title = 'تم تحديث موعدك';
    if (status === 'cancelled') title = 'تم إلغاء موعدك';
    else if (previous.status === 'pending' && status === 'confirmed') title = 'تم تأكيد موعدك';
    const notifyCustomer = req.body.notifyCustomer !== false;
    const pushResult = notifyCustomer
      ? await pushService.sendToUser(appointment.customer, {
        title, body: `${service}، ${formatJerusalemDate(start)} الساعة ${time}${appointment.notes ? ` — ${appointment.notes}` : ''}`,
        url: './index.html', tag: `appointment-update-${appointment._id}-${Date.now()}`
      })
      : { sent: 0, failed: 0 };
    res.json({ success: true, data: appointment, pushNotificationSent: pushResult.sent > 0 });
  } catch (error) {
    console.error('Appointment update failed:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء تحديث الموعد' });
  }
};
