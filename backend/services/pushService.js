const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const BusinessSettings = require('../models/BusinessSettings');
const Message = require('../models/Message');

let configuredPublicKey = null;

async function configure() {
  if (configuredPublicKey) return configuredPublicKey;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:owner@example.com';
  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredPublicKey = publicKey;
    return publicKey;
  }
  let settings = await BusinessSettings.findOne().select('+vapidPublicKey +vapidPrivateKey');
  if (!settings) settings = await BusinessSettings.create({});
  if (!settings.vapidPublicKey || !settings.vapidPrivateKey) {
    const generated = webpush.generateVAPIDKeys();
    settings.vapidPublicKey = generated.publicKey;
    settings.vapidPrivateKey = generated.privateKey;
    await settings.save();
  }
  webpush.setVapidDetails(subject, settings.vapidPublicKey, settings.vapidPrivateKey);
  configuredPublicKey = settings.vapidPublicKey;
  return configuredPublicKey;
}

exports.getPublicKey = () => configure();

exports.saveSubscription = async (userId, subscription, userAgent) => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('اشتراك الإشعارات غير صالح');
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { user: userId, endpoint: subscription.endpoint, keys: subscription.keys, userAgent },
    { upsert: true, new: true, runValidators: true }
  );
};

exports.removeSubscription = async (userId, endpoint) => {
  await PushSubscription.deleteOne({ user: userId, endpoint });
};

exports.saveMessagesForUsers = async (userIds, payload) => {
  const validUserIds = userIds.filter(Boolean);
  if (!validUserIds.length) return { saved: 0 };
  const tag = String(payload.tag || `message-${Date.now()}`);
  await Promise.all(validUserIds.map((user) => Message.updateOne(
    { user, tag },
    { $setOnInsert: { user, tag, title: String(payload.title || 'إشعار جديد'), body: String(payload.messageBody || payload.body || ''), url: String(payload.url || './index.html'), appointment: payload.appointmentId || null, actionType: String(payload.actionType || ''), conversationId: payload.conversationIds?.[String(user)] || payload.conversationId || null } },
    { upsert: true }
  )));
  return { saved: validUserIds.length };
};

exports.sendToUsers = async (userIds, payload, { includeRecipients = false } = {}) => {
  const validUserIds = userIds.filter(Boolean);
  if (!validUserIds.length) return { sent: 0, failed: 0, ...(includeRecipients ? { recipients: [] } : {}) };
  await exports.saveMessagesForUsers(validUserIds, payload);
  await configure();
  const subscriptions = await PushSubscription.find({ user: { $in: validUserIds } });
  const recipients = includeRecipients ? new Map(validUserIds.map((user) => [String(user), { user, attempted: 0, sent: 0, failed: 0 }])) : null;
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    const recipient = recipients?.get(String(subscription.user));
    if (recipient) recipient.attempted += 1;
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload));
      sent += 1;
      if (recipient) recipient.sent += 1;
    } catch (error) {
      failed += 1;
      if (recipient) recipient.failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) await subscription.deleteOne();
      else console.error('Push delivery failed:', error.message);
    }
  }
  return { sent, failed, ...(recipients ? { recipients: [...recipients.values()] } : {}) };
};

exports.sendToUser = (userId, payload, options) => exports.sendToUsers([userId], payload, options);

exports.sendToOwners = async (payload) => {
  const owners = await User.find({ role: 'owner', active: true }).select('_id');
  return exports.sendToUsers(owners.map((owner) => owner._id), payload);
};
