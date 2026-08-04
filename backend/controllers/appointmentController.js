const Appointment = require('../models/Appointment');
const pushService = require('../services/pushService');
const { formatJerusalemDate } = require('../utils/timeZone');

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
  res.json({ success: true, pushNotificationSent: pushResult.sent > 0 });
};
