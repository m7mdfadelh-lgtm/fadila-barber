const Appointment = require('../models/Appointment');
const pushService = require('../services/pushService');
const { formatJerusalemDate } = require('../utils/timeZone');
const { notifyForReleasedAppointment } = require('../services/waitlistService');

function scope(req) {
  return req.user.role === 'owner' ? {} : { customer: req.user._id };
}

exports.getAllAppointments = async (req, res) => {
  const data = await Appointment.find(scope(req)).sort({ date: 1 });
  res.json({ success: true, data });
};

exports.getAppointment = async (req, res) => {
  const data = await Appointment.findOne({ _id: req.params.id, ...scope(req) });
  if (!data) return res.status(404).json({ success: false, error: 'لم يتم العثور على الموعد' });
  res.json({ success: true, data });
};

exports.confirmAttendance = async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه العملية متاحة للزبائن فقط' });
  const appointment = await Appointment.findOne({ _id: req.params.id, customer: req.user._id });
  if (!appointment || appointment.status !== 'confirmed' || appointment.date <= new Date()) {
    return res.status(409).json({ success: false, error: 'لا يمكن تأكيد الحضور لهذا الموعد' });
  }
  appointment.customerConfirmedAt = new Date();
  await appointment.save();
  await pushService.sendToOwners({
    title: 'الزبون أكد حضوره',
    body: `${appointment.customerName} أكد حضوره لـ${appointment.service} بتاريخ ${formatJerusalemDate(appointment.date)} الساعة ${appointment.time}`,
    url: './dashboard.html', appointmentId: appointment._id, actionType: 'owner-message', tag: `attendance-${appointment._id}`
  }).catch((error) => console.error('Attendance confirmation notification failed:', error));
  res.json({ success: true, data: appointment });
};

exports.markCustomerArrived = async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ success: false, error: 'هذه العملية متاحة لصاحب المحل فقط' });
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment || appointment.status !== 'confirmed') return res.status(409).json({ success: false, error: 'لا يمكن تسجيل الوصول لهذا الموعد' });
  appointment.customerArrivedAt = new Date();
  await appointment.save();
  res.json({ success: true, data: appointment });
};

exports.deleteAppointment = async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ success: false, error: 'يمكن لصاحب المحل فقط حذف موعد' });
  const data = await Appointment.findById(req.params.id);
  if (!data) return res.status(404).json({ success: false, error: 'لم يتم العثور على الموعد' });
  let pushResult = { sent: 0 };
  try {
    pushResult = await pushService.sendToUser(data.customer, {
      title: 'تم إلغاء موعدك',
      body: `${data.service}، ${formatJerusalemDate(data.date)} الساعة ${data.time}`,
      url: './index.html',
      tag: `appointment-deleted-${data._id}`
    });
  } catch (error) {
    console.error('Appointment deletion notification failed:', error);
  }
  await data.deleteOne();
  if (data.status !== 'cancelled') notifyForReleasedAppointment(data).catch((error) => console.error('Waitlist release failed:', error));
  res.json({ success: true, pushNotificationSent: pushResult.sent > 0 });
};
