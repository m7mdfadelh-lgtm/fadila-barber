const router = require('express').Router();
const Message = require('../models/Message');
const Appointment = require('../models/Appointment');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', async (req, res) => {
  const [data, unreadCount] = await Promise.all([
    Message.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Message.countDocuments({ user: req.user._id, readAt: null })
  ]);
  res.json({ success: true, data, unreadCount });
});

router.put('/read-all', async (req, res) => {
  await Message.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true });
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
