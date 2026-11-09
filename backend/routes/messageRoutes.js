const router = require('express').Router();
const Message = require('../models/Message');
const Appointment = require('../models/Appointment');
const { protect } = require('../middleware/authMiddleware');
const pushService = require('../services/pushService');
const crypto = require('crypto');

router.use(protect);

router.post('/contact', async (req, res) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({ success: false, error: 'هذه الخدمة مخصصة للعملاء' });
  }

  const text = String(req.body.body || '').trim();
  if (!text || text.length > 400) {
    return res.status(400).json({ success: false, error: 'اكتب رسالة لا تتجاوز 400 حرف' });
  }

  const sender = [req.user.name, req.user.phone].filter(Boolean).join(' · ').slice(0, 90);
  const title = 'رسالة جديدة من عميل';
  const body = `من ${sender || 'عميل'}:\n${text}`;
  const tag = `customer-message-${req.user._id}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;

  try {
    const result = await pushService.sendToOwners({
      title,
      body,
      url: './dashboard.html',
      tag
    });
    return res.json({ success: true, notificationSent: result.sent > 0 });
  } catch (error) {
    console.error('Customer message delivery failed:', error);
    return res.status(500).json({ success: false, error: 'تعذر إرسال الرسالة الآن' });
  }
});

router.get('/', async (req, res) => {
  const [data, unreadCount] = await Promise.all([
    Message.find({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
    Message.countDocuments({ user: req.user._id, readAt: null })
  ]);
  res.json({ success: true, data, unreadCount });
});


router.put('/:id/read', async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(String(req.params.id)) || typeof req.body.read !== 'boolean') {
    return res.status(400).json({ success: false, error: 'بيانات القراءة غير صالحة' });
  }
  const updated = await Message.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { readAt: req.body.read ? new Date() : null } },
    { new: true }
  ).select('_id readAt').lean();
  if (!updated) return res.status(404).json({ success: false, error: 'لم يتم العثور على الرسالة' });
  res.json({ success: true, data: updated });
});

router.put('/read-all', async (req, res) => {
  await Message.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true });
});

router.delete('/', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).filter((id) => /^[a-f\d]{24}$/i.test(id)) : [];
  if (!ids.length) return res.status(400).json({ success: false, error: 'يرجى اختيار رسالة واحدة على الأقل' });
  const result = await Message.deleteMany({ user: req.user._id, _id: { $in: ids } });
  res.json({ success: true, deleted: result.deletedCount });
});

router.delete('/treated/all', async (req, res) => {
  const messages = await Message.find({
    user: req.user._id,
    $or: [{ actionType: 'change-request' }, { tag: /^change-request-[a-f\d]{24}-/i }, { tag: /^new-[a-f\d]{24}$/i }]
  }).sort({ createdAt: -1 }).lean();
  const getAppointmentId = (item) => item.appointment?.toString() || String(item.tag).match(/^(?:change-request-|new-)([a-f\d]{24})(?:-|$)/i)?.[1];
  const appointmentIds = [...new Set(messages.map(getAppointmentId).filter(Boolean))];
  const appointments = await Appointment.find({ _id: { $in: appointmentIds } }).select('status changeRequest').lean();
  const appointmentMap = new Map(appointments.map((item) => [item._id.toString(), item]));
  const newestLegacyMessage = new Map();
  messages.forEach((item) => {
    const id = getAppointmentId(item);
    if (id && !newestLegacyMessage.has(id)) newestLegacyMessage.set(id, item._id.toString());
  });
  const treatedIds = messages.filter((item) => {
    const id = getAppointmentId(item);
    const appointment = appointmentMap.get(id);
    if (/^new-[a-f\d]{24}$/i.test(String(item.tag))) return appointment?.status !== 'pending';
    if (appointment?.changeRequest?.status !== 'pending') return true;
    const currentTag = appointment.changeRequest.notificationTag;
    return currentTag ? item.tag !== currentTag : item._id.toString() !== newestLegacyMessage.get(id);
  }).map((item) => item._id);
  if (treatedIds.length) await Message.deleteMany({ user: req.user._id, _id: { $in: treatedIds } });
  res.json({ success: true, deleted: treatedIds.length });
});

router.delete('/:id', async (req, res) => {
  const deleted = await Message.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) return res.status(404).json({ success: false, error: 'لم يتم العثور على الرسالة' });
  res.json({ success: true });
});

module.exports = router;
