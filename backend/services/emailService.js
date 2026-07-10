const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getRecipients(includeAdminAlert = false) {
  const recipients = [process.env.BUSINESS_OWNER_EMAIL];

  if (includeAdminAlert && process.env.ADMIN_ALERT_EMAIL) {
    recipients.push(process.env.ADMIN_ALERT_EMAIL);
  }

  return [...new Set(recipients.filter(Boolean))];
}

function getMissingEmailEnv() {
  return [
    'EMAIL_USER',
    'EMAIL_APP_PASSWORD',
    'BUSINESS_OWNER_EMAIL'
  ].filter((key) => !process.env[key]);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000
});

async function verifyConnection() {
  const missing = getMissingEmailEnv();

  if (missing.length > 0) {
    const message = `Missing email environment variables: ${missing.join(', ')}`;
    console.error(`❌ ${message}`);
    return { success: false, error: message };
  }

  try {
    await transporter.verify();
    console.log('✅ Gmail SMTP 587 connection verified successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Gmail SMTP 587 verification failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendMail(options) {
  const missing = getMissingEmailEnv();

  if (missing.length > 0) {
    throw new Error(`Missing email environment variables: ${missing.join(', ')}`);
  }

  const info = await transporter.sendMail({
    from: `"Fadila Barber System" <${process.env.EMAIL_USER}>`,
    ...options,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to
  });

  console.log(`✅ Email sent successfully with Gmail: ${info.messageId}`);
  return info;
}

async function sendNewAppointmentEmail(appointment) { return sendMail({ to: getRecipients(false), subject: '📅 תור חדש נקבע!', html: '<div>New Appointment</div>'}); }
async function sendWhatsAppFailureEmail(data) { return sendMail({ to: getRecipients(true), subject: '⚠️ כשל בשליחת WhatsApp', html: '<div>WhatsApp Failure</div>'}); }

module.exports = {
  verifyConnection,
  sendNewAppointmentEmail,
  sendWhatsAppFailureEmail
};