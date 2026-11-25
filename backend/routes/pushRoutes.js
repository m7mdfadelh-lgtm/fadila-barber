const router = require('express').Router();
const pushService = require('../services/pushService');
const User = require('../models/User');
const PushSubscription = require('../models/PushSubscription');
const PushCampaign = require('../models/PushCampaign');
const Conversation = require('../models/Conversation');
const crypto = require('crypto');
const { protect, ownerOnly } = require('../middleware/authMiddleware');

async function recordCampaign({ owner, audience, title, body, customers, result }) {
  const deliveries = new Map((result.recipients || []).map((item) => [String(item.user), item]));
  const campaign = await PushCampaign.create({
    owner,
    audience,
    title,
    body,
    recipientCount: customers.length,
    sentDevices: result.sent || 0,
    failedDevices: result.failed || 0,
    recipients: customers.map((customer) => {
      const delivery = deliveries.get(String(customer._id)) || { attempted: 0, sent: 0, failed: 0 };
      const status = delivery.attempted === 0
        ? 'no-subscription'
        : delivery.sent === 0
          ? 'failed'
          : delivery.failed > 0 ? 'partial' : 'sent';
      return {
        user: customer._id,
        name: customer.name,
        phone: customer.phone,
        active: customer.active !== false,
        status,
        attemptedDevices: delivery.attempted,
        sentDevices: delivery.sent,
        failedDevices: delivery.failed
      };
    })
  });
  const olderCampaigns = await PushCampaign.find({ owner }).sort({ createdAt: -1 }).skip(5).select('_id').lean();
  if (olderCampaigns.length) await PushCampaign.deleteMany({ _id: { $in: olderCampaigns.map((item) => item._id) } });
  return campaign;
}

router.get('/public-key', protect, async (req, res) => res.json({ publicKey: await pushService.getPublicKey() }));
router.get('/campaigns', protect, ownerOnly, async (req, res) => {
  const campaigns = await PushCampaign.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(5).lean();
  res.json({ success: true, data: campaigns });
});
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
      const customers = await User.find({ role: 'customer' }).select('_id name phone active');
      if (!customers.length) {
        return res.status(404).json({ success: false, error: 'لم يتم العثور على زبائن' });
      }

      const threadBody = `${title}\n\n${body}`;
      const conversations = await Conversation.insertMany(customers.map((customer) => ({
        customer: customer._id,
        messages: [{ sender: req.user._id, body: threadBody }]
      })));
      const conversationIds = Object.fromEntries(conversations.map((conversation) => [
        conversation.customer.toString(),
        conversation._id.toString()
      ]));
      const customerIds = customers.map((customer) => customer._id);
      const subscriptions = await PushSubscription.find({ user: { $in: customerIds } }).select('user').lean();
      const subscribedCustomerIds = new Set(subscriptions.map((subscription) => String(subscription.user)));
      const result = await pushService.sendToUsers(
        customerIds,
        {
          title, body, url: './index.html',
          tag: `manual-all-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          actionType: 'owner-message',
          conversationIds
        },
        { includeRecipients: true }
      );
      const campaign = await recordCampaign({ owner: req.user._id, audience: 'all', title, body, customers, result });

      return res.json({
        success: true,
        audience: 'all',
        campaignId: campaign._id,
        customerCount: customers.length,
        subscribedCustomerCount: subscribedCustomerIds.size,
        noSubscriptionCount: customers.length - subscribedCustomerIds.size,
        ...result
      });
    }

    const customer = await User.findOne({ _id: customerId, role: 'customer' });
    if (!customer) return res.status(404).json({ success: false, error: 'لم يتم العثور على الزبون' });

    const conversation = await Conversation.create({
      customer: customer._id,
      messages: [{ sender: req.user._id, body: `${title}\n\n${body}` }]
    });
    const result = await pushService.sendToUser(customer._id, {
      title,
      body,
      url: './index.html',
      tag: `manual-${customer._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      actionType: 'owner-message',
      conversationId: conversation._id
    }, { includeRecipients: true });
    const campaign = await recordCampaign({ owner: req.user._id, audience: 'single', title, body, customers: [customer], result });

    return res.json({
      success: true,
      audience: 'single',
      campaignId: campaign._id,
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
