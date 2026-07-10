const axios = require('axios');
const Settings = require('../models/Settings');

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

async function sendMessage(phone, message) {
  try {
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
  } catch (error) {
    const errorMessage = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    console.error(`❌ WhatsApp failed for ${phone}:`, errorMessage);
    throw error;
  }
}

module.exports = { sendMessage, normalizePhone };
