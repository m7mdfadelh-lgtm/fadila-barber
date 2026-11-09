const router = require('express').Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { protect } = require('../middleware/authMiddleware');
const pushService = require('../services/pushService');
const crypto = require('crypto');

router.use(protect);

router.post('/contact', async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه الخدمة مخصصة للعملاء' });
  const text = String(req.body.body || '').trim();
  if (!text || text.length > 400) return res.status(400).json({ success: false, error: 'اكتب رسالة لا تتجاوز 400 حرف' });
  try {
    const conversation = await Conversation.create({ customer: req.user._id, messages: [{ sender: req.user._id, body: text }] });
    const sender = [req.user.name, req.user.phone].filter(Boolean).join(' · ').slice(0, 90);
    const tag = `customer-message-${conversation._id}-${crypto.randomBytes(5).toString('hex')}`;
    let notificationSent = false;
    try {
      const result = await pushService.sendToOwners({
        title: 'رسالة جديدة من عميل', body: `من ${sender || 'عميل'}:\n${text}`,
        url: './dashboard.html', tag, actionType: 'customer-message', conversationId: conversation._id
      });
      notificationSent = result.sent > 0;
    } catch (error) { console.error('Customer message notification failed:', error); }
    return res.json({ success: true, conversationId: conversation._id, notificationSent });
  } catch (error) {
    console.error('Customer message creation failed:', error);
    return res.status(500).json({ success: false, error: 'تعذر إرسال الرسالة الآن' });
  }
});

router.get('/conversations/:id', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
  const conversation = await Conversation.findById(req.params.id).populate('customer', 'name phone');
  if (!conversation) return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
  const customerId = conversation.customer._id.toString();
  if (req.user.role !== 'owner' && customerId !== req.user._id.toString()) return res.status(403).json({ success: false, error: 'لا يمكنك فتح هذه المحادثة' });
  let changed = false;
  conversation.messages.forEach(item => {
    if (item.sender.toString() !== req.user._id.toString() && !item.readAt) { item.readAt = new Date(); changed = true; }
  });
  if (changed) await conversation.save();
  res.json({ success: true, data: {
    _id: conversation._id,
    customer: { name: conversation.customer.name, phone: conversation.customer.phone },
    messages: conversation.messages.map(item => {
      const isCustomer = item.sender.toString() === customerId;
      return { _id: item._id, body: item.body, createdAt: item.createdAt, readAt: item.readAt,
        senderRole: isCustomer ? 'customer' : 'owner', senderName: isCustomer ? conversation.customer.name : 'الإدارة',
        isMine: item.sender.toString() === req.user._id.toString() };
    })
  }});
});

router.post('/conversations/:id/replies', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
  const text = String(req.body.body || '').trim();
  if (!text || text.length > 400) return res.status(400).json({ success: false, error: 'اكتب رداً لا يتجاوز 400 حرف' });
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    const isOwner = req.user.role === 'owner';
    if (!isOwner && conversation.customer.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, error: 'لا يمكنك الرد على هذه المحادثة' });
    conversation.messages.push({ sender: req.user._id, body: text });
    conversation.lastMessageAt = new Date();
    await conversation.save();
    const sender = [req.user.name, req.user.phone].filter(Boolean).join(' · ').slice(0, 90);
    const payload = {
      title: isOwner ? 'رد جديد من الإدارة' : 'رد جديد من العميل',
      body: `من ${sender || (isOwner ? 'الإدارة' : 'عميل')}:\n${text}`,
      url: isOwner ? './index.html' : './dashboard.html',
      tag: `message-reply-${conversation._id}-${crypto.randomBytes(5).toString('hex')}`,
      actionType: 'message-reply', conversationId: conversation._id
    };
    try {
      const result = isOwner ? await pushService.sendToUser(conversation.customer, payload) : await pushService.sendToOwners(payload);
      return res.json({ success: true, notificationSent: result.sent > 0 });
    } catch (error) {
      console.error('Conversation reply notification failed:', error);
      return res.json({ success: true, notificationSent: false });
    }
  } catch (error) {
    console.error('Conversation reply failed:', error);
    return res.status(500).json({ success: false, error: 'تعذر إرسال الرد الآن' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'customer') {
      const legacyMessages = await Message.find({
        user: req.user._id,
        conversationId: null,
        tag: /^manual(?:-all)?-/i
      }).sort({ createdAt: 1 }).lean();
      if (legacyMessages.length) {
        const owner = await User.findOne({ role: 'owner', active: true }).select('_id').lean();
        if (owner) {
          for (const item of legacyMessages) {
            const conversation = await Conversation.create({
              customer: req.user._id,
              messages: [{ sender: owner._id, body: `${item.title}\n\n${item.body}` }]
            });
            const linked = await Message.findOneAndUpdate(
              { _id: item._id, user: req.user._id, conversationId: null },
              { $set: { conversationId: conversation._id, actionType: 'owner-message' } },
              { new: true }
            ).select('_id').lean();
            if (!linked) await Conversation.deleteOne({ _id: conversation._id });
          }
        }
      }
    }

    const [data, unreadCount] = await Promise.all([
      Message.find({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
      Message.countDocuments({ user: req.user._id, readAt: null })
    ]);
    res.json({ success: true, data, unreadCount });
  } catch (error) {
    console.error('Messages load failed:', error);
    res.status(500).json({ success: false, error: 'تعذر تحميل الرسائل الآن' });
  }
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
