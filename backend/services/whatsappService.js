const axios = require('axios');
const crypto = require('crypto');
const Settings = require('../models/Settings');
const WhatsAppQueue = require('../models/WhatsAppQueue');

function normalizePhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = `972${cleaned.substring(1)}`;
  }

  if (!cleaned.startsWith('972')) {
    cleaned = `972${cleaned}`;
  }

  return cleaned;
}

function getErrorMessage(error) {
  const raw = error.response?.data
    ? (typeof error.response.data === 'string'
      ? error.response.data
      : JSON.stringify(error.response.data))
    : error.message;

  return String(raw || 'Unknown WhatsApp error').slice(0, 2000);
}

function createFingerprint(phone, message) {
  return crypto
    .createHash('sha256')
    .update(`${normalizePhone(phone)}|${String(message)}`)
    .digest('hex');
}

async function getWahaConfig() {
  const config = await Settings.findById('waha_live_url');

  if (!config || !config.url) {
    throw new Error('WAHA URL not found in DB');
  }

  if (!process.env.WAHA_SESSION) {
    throw new Error('WAHA_SESSION is missing');
  }

  if (!process.env.WAHA_API_KEY) {
    throw new Error('WAHA_API_KEY is missing');
  }

  return config;
}

async function sendDirect(phone, message) {
  const config = await getWahaConfig();
  const normalized = normalizePhone(phone);

  const response = await axios.post(
    `${config.url}/api/sendText`,
    {
      chatId: `${normalized}@c.us`,
      text: message,
      session: process.env.WAHA_SESSION
    },
    {
      headers: {
        'x-api-key': process.env.WAHA_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  console.log(`✅ WhatsApp sent to ${normalized} using: ${config.url}`);
  return { success: true, data: response.data };
}

async function enqueueFailedMessage(phone, message, error) {
  const normalized = normalizePhone(phone);
  const fingerprint = createFingerprint(normalized, message);
  const errorMessage = getErrorMessage(error);

  const existing = await WhatsAppQueue.findOne({
    fingerprint,
    status: { $in: ['pending', 'processing'] }
  });

  if (existing) {
    existing.status = 'pending';
    existing.lastError = errorMessage;
    existing.nextAttemptAt = new Date(Date.now() + 60 * 1000);
    await existing.save();
    return existing;
  }

  return WhatsAppQueue.create({
    phone: normalized,
    message: String(message),
    fingerprint,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(Date.now() + 60 * 1000),
    lastError: errorMessage
  });
}

async function sendMessage(phone, message) {
  try {
    return await sendDirect(phone, message);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error(`❌ WhatsApp failed for ${phone}:`, errorMessage);

    try {
      const queued = await enqueueFailedMessage(phone, message, error);
      console.log(`📥 WhatsApp message queued for retry: ${queued._id}`);
      return {
        success: false,
        queued: true,
        queueId: queued._id,
        error: errorMessage
      };
    } catch (queueError) {
      console.error('❌ Failed to save WhatsApp message to retry queue:', queueError.message);
      throw error;
    }
  }
}

async function recoverStuckMessages() {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);

  const result = await WhatsAppQueue.updateMany(
    {
      status: 'processing',
      lastAttemptAt: { $lte: staleBefore }
    },
    {
      $set: {
        status: 'pending',
        nextAttemptAt: new Date()
      }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`♻️ Recovered ${result.modifiedCount} stuck WhatsApp queue message(s)`);
  }
}

async function processPendingQueue(limit = 20) {
  await recoverStuckMessages();

  const now = new Date();

  const pendingMessages = await WhatsAppQueue.find({
    status: 'pending',
    nextAttemptAt: { $lte: now }
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  if (pendingMessages.length === 0) return { processed: 0, sent: 0 };

  let sent = 0;

  for (const queuedMessage of pendingMessages) {
    const locked = await WhatsAppQueue.findOneAndUpdate(
      { _id: queuedMessage._id, status: 'pending' },
      {
        $set: {
          status: 'processing',
          lastAttemptAt: new Date()
        },
        $inc: { attempts: 1 }
      },
      { new: true }
    );

    if (!locked) continue;

    try {
      await sendDirect(locked.phone, locked.message);

      locked.status = 'sent';
      locked.sentAt = new Date();
      locked.lastError = undefined;
      await locked.save();
      sent += 1;

      console.log(`✅ Queued WhatsApp sent after ${locked.attempts} attempt(s): ${locked._id}`);
    } catch (error) {
      locked.status = 'pending';
      locked.lastError = getErrorMessage(error);
      locked.nextAttemptAt = new Date(Date.now() + 60 * 1000);
      await locked.save();

      console.error(
        `❌ Queued WhatsApp retry failed (${locked.attempts} attempts):`,
        locked.lastError
      );
    }
  }

  return { processed: pendingMessages.length, sent };
}

module.exports = {
  sendMessage,
  sendDirect,
  processPendingQueue,
  normalizePhone
};
