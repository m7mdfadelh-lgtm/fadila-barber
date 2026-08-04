const router = require('express').Router();
const pushService = require('../services/pushService');
const User = require('../models/User');
const { protect, ownerOnly } = require('../middleware/authMiddleware');

router.get('/public-key', protect, async (req, res) => res.json({ publicKey: await pushService.getPublicKey() }));
router.post('/subscribe', protect, async (req, res) => {
  try {
    await pushService.saveSubscription(req.user._id, req.body.subscription, req.headers['user-agent']);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
router.post('/test', protect, async (req, res) => {
  const result = await pushService.sendToUser(req.user._id, {
    title: 'إشعار تجريبي',
    body: `مرحباً ${req.user.name}، الإشعارات تعمل على هذا الجهاز.`,
    url: req.user.role === 'owner' ? './dashboard.html' : './index.html',
    tag: `push-test-${req.user._id}`
  });
  res.json({ success: true, ...result });
});
router.post('/send', protect, ownerOnly, async (req, res) => {
  try {
    const customerId = String(req.body.customerId || '');
    const sendToAll = req.body.sendToAll === true;
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();

    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة عنوان ومحتوى الرسالة' });
    }

    if (title.length > 80 || body.length > 240) {
      return res.status(400).json({ success: false, error: 'العنوان أو الرسالة أطول من المسموح' });
    }

    if (sendToAll) {
      const customers = await User.find({ role: 'customer', active: true }).select('_id');
      if (!customers.length) {
        return res.status(404).json({ success: false, error: 'لم يتم العثور على زبائن نشطين' });
      }

      const result = await pushService.sendToUsers(
        customers.map((customer) => customer._id),
        { title, body, url: './index.html', tag: `manual-all-${Date.now()}` }
      );

      return res.json({
        success: true,
        audience: 'all',
        customerCount: customers.length,
        ...result
      });
    }

    const customer = await User.findOne({ _id: customerId, role: 'customer', active: true });
    if (!customer) return res.status(404).json({ success: false, error: 'لم يتم العثور على الزبون' });

    const result = await pushService.sendToUser(customer._id, {
      title,
      body,
      url: './index.html',
      tag: `manual-${customer._id}-${Date.now()}`
    });

    return res.json({
      success: true,
      audience: 'single',
      customer: customer.toSafeObject(),
      ...result
    });
  } catch (error) {
    console.error('Manual push failed:', error);
    return res.status(400).json({ success: false, error: 'تعذر إرسال الإشعار' });
  }
});
router.delete('/subscribe', protect, async (req, res) => {
  await pushService.removeSubscription(req.user._id, req.body.endpoint);
  res.json({ success: true });
});

module.exports = router;
