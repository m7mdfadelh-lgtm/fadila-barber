const Appointment = require('../models/Appointment');
const pushService = require('../services/pushService');
const Service = require('../models/Service');
const BusinessSettings = require('../models/BusinessSettings');
const Message = require('../models/Message');
const { formatJerusalemDate, jerusalemDateTimeToUtc, getAppointmentInstant } = require('../utils/timeZone');

const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayKey = (date) => dayKeys[new Date(`${date}T12:00:00Z`).getUTCDay()];

exports.createChangeRequest = async (req, res) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه العملية متاحة للزبون فقط' });
    const text = String(req.body.text || '').trim();
    const requestedService = String(req.body.service || '').trim();
    const requestedDate = String(req.body.date || '').trim();
    const requestedTime = String(req.body.time || '').trim();
    if (!requestedService || !requestedDate || !requestedTime) return res.status(400).json({ success: false, error: 'يرجى اختيار الخدمة والتاريخ والساعة المطلوبة' });
    if (text.length > 500) return res.status(400).json({ success: false, error: 'طلب التعديل أطول من المسموح' });
    const serviceDoc = await Service.findOne({ name: requestedService });
    if (!serviceDoc) return res.status(400).json({ success: false, error: 'لم يتم العثور على الخدمة' });
    const requestedStart = jerusalemDateTimeToUtc(requestedDate, requestedTime);
    if (Number.isNaN(requestedStart.getTime()) || requestedStart <= new Date()) return res.status(400).json({ success: false, error: 'التاريخ أو الساعة غير صالحين' });
    const appointment = await Appointment.findOne({ _id: req.params.id, customer: req.user._id });
    if (!appointment) return res.status(404).json({ success: false, error: 'لم يتم العثور على الموعد' });
    if (['cancelled', 'completed', 'no-show'].includes(appointment.status)) return res.status(400).json({ success: false, error: 'لا يمكن طلب تعديل لهذا الموعد' });
    if (appointment.changeRequest?.status === 'pending') return res.status(409).json({ success: false, error: 'يوجد طلب تعديل قيد المراجعة بالفعل' });
    const notificationTag = `change-request-${appointment._id}-${Date.now()}`;
    appointment.changeRequest = { text, requestedService, requestedDate, requestedTime, notificationTag, status: 'pending', requestedAt: new Date(), resolvedAt: null };
    await appointment.save();
    await pushService.sendToOwners({
      title: 'طلب تعديل موعد جديد',
      body: `${appointment.customerName}: ${requestedService}، ${requestedDate} الساعة ${requestedTime}${text ? ` — ${text}` : ''}`,
      url: './dashboard.html',
      appointmentId: appointment._id,
      actionType: 'change-request',
      tag: notificationTag
    });
    res.json({ success: true, data: appointment.changeRequest });
  } catch (error) {
    console.error('Create change request failed:', error);
    res.status(500).json({ success: false, error: 'تعذر إرسال طلب التعديل' });
  }
};

exports.resolveChangeRequest = async (req, res) => {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ success: false, error: 'هذه العملية متاحة لصاحب المحل فقط' });
    const decision = String(req.body.decision || '');
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ success: false, error: 'القرار غير صالح' });
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ success: false, error: 'لم يتم العثور على الموعد' });
    if (appointment.changeRequest?.status !== 'pending') return res.status(409).json({ success: false, error: 'لا يوجد طلب تعديل قيد المراجعة' });
    const requestText = String(appointment.changeRequest.text || '');
    if (decision === 'approved') {
      const serviceDoc = await Service.findOne({ name: appointment.changeRequest.requestedService });
      if (!serviceDoc) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'الخدمة المطلوبة لم تعد متاحة. يجب تعديل الموعد يدوياً' });
      const date = appointment.changeRequest.requestedDate;
      const time = appointment.changeRequest.requestedTime;
      const start = jerusalemDateTimeToUtc(date, time);
      if (Number.isNaN(start.getTime()) || start <= new Date()) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'التاريخ أو الساعة المطلوبة لم تعد صالحة. يجب تعديل الموعد يدوياً' });
      const duration = Number(serviceDoc.duration) || 30;
      const end = new Date(start.getTime() + duration * 60000);
      const settings = await BusinessSettings.findOne();
      const hours = settings?.workingHours?.[dayKey(date)];
      if (!hours?.enabled) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'المحل مغلق في اليوم المطلوب. يجب تعديل الموعد يدوياً' });
      const workStart = jerusalemDateTimeToUtc(date, hours.start);
      const workEnd = jerusalemDateTimeToUtc(date, hours.end);
      if (start < workStart || end > workEnd) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'الوقت المطلوب خارج ساعات العمل. يجب تعديل الموعد يدوياً' });
      if ((hours.breaks || []).some((item) => start < jerusalemDateTimeToUtc(date, item.end) && end > jerusalemDateTimeToUtc(date, item.start))) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'الوقت المطلوب يقع ضمن وقت الاستراحة. يجب تعديل الموعد يدوياً' });
      const nearby = await Appointment.find({ _id: { $ne: appointment._id }, status: { $ne: 'cancelled' }, date: { $gte: new Date(start - 86400000), $lte: new Date(start.getTime() + 86400000) } });
      const conflict = nearby.some((item) => { const otherStart = getAppointmentInstant(item); return start < new Date(otherStart.getTime() + item.duration * 60000) && end > otherStart; });
      if (conflict) return res.status(409).json({ success: false, requiresManualEdit: true, error: 'الوقت المطلوب يتعارض مع موعد آخر. يجب تعديل الموعد يدوياً' });
      Object.assign(appointment, { service: serviceDoc.name, duration, date: start, time, notes: requestText || appointment.notes, clientReminderSent: false, ownerReminderSent: false });
    }
    appointment.changeRequest.status = decision;
    appointment.changeRequest.resolvedAt = new Date();
    await appointment.save();
    await Message.deleteMany({
      $or: [
        { appointment: appointment._id, actionType: 'change-request' },
        { tag: { $regex: `^change-request-${appointment._id}-` } }
      ]
    });
    const approved = decision === 'approved';
    const result = await pushService.sendToUser(appointment.customer, {
      title: approved ? 'تمت الموافقة على طلب التعديل' : 'تم رفض طلب التعديل',
      body: approved ? `تم تعديل موعدك إلى ${appointment.service} بتاريخ ${formatJerusalemDate(appointment.date)} الساعة ${appointment.time}` : `تعذر الموافقة على طلب تعديل موعد ${appointment.service}`,
      url: './index.html',
      tag: `change-request-result-${appointment._id}-${Date.now()}`
    });
    res.json({ success: true, data: appointment.changeRequest, pushNotificationSent: result.sent > 0 });
  } catch (error) {
    console.error('Resolve change request failed:', error);
    res.status(500).json({ success: false, error: 'تعذر تحديث طلب التعديل' });
  }
};
