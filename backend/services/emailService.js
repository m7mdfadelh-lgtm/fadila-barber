const axios = require('axios');
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

function getEmailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'smtp';
}

function getMissingEmailEnv() {
  const commonRequired = ['BUSINESS_OWNER_EMAIL'];

  if (getEmailProvider() === 'resend') {
    return [...commonRequired, 'RESEND_API_KEY', 'EMAIL_FROM']
      .filter((key) => !process.env[key]);
  }

  return [...commonRequired, 'EMAIL_USER', 'EMAIL_APP_PASSWORD']
    .filter((key) => !process.env[key]);
}

const smtpPort = Number(process.env.SMTP_PORT || 465);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000
});

async function verifyConnection() {
  const missing = getMissingEmailEnv();
  const provider = getEmailProvider();

  if (missing.length > 0) {
    const message = `Missing email environment variables: ${missing.join(', ')}`;
    console.error(`❌ ${message}`);
    return { success: false, error: message, provider };
  }

  if (provider === 'resend') {
    console.log('✅ Resend email API is configured');
    return { success: true, provider };
  }

  try {
    await transporter.verify();
    console.log('✅ Email SMTP connection verified successfully');
    return { success: true, provider };
  } catch (error) {
    console.error('❌ Email SMTP verification failed:', error.message);
    console.error('ℹ️ Add RESEND_API_KEY and EMAIL_FROM to use HTTPS email delivery instead of SMTP.');
    return { success: false, error: error.message, provider };
  }
}

async function sendWithResend(options) {
  const response = await axios.post(
    'https://api.resend.com/emails',
    {
      from: process.env.EMAIL_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  console.log(`✅ Email sent successfully with Resend: ${response.data.id}`);
  return response.data;
}

async function sendWithSmtp(options) {
  const info = await transporter.sendMail({
    from: `"Fadila Barber System" <${process.env.EMAIL_USER}>`,
    ...options,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to
  });

  console.log(`✅ Email sent successfully with SMTP: ${info.messageId}`);
  return info;
}

async function sendMail(options) {
  const missing = getMissingEmailEnv();

  if (missing.length > 0) {
    throw new Error(`Missing email environment variables: ${missing.join(', ')}`);
  }

  if (getEmailProvider() === 'resend') {
    return sendWithResend(options);
  }

  return sendWithSmtp(options);
}

/* ===============================
   New appointment email
=================================*/
async function sendNewAppointmentEmail(appointment) {
  try {
    const recipients = getRecipients(false);

    await sendMail({
      to: recipients,
      subject: '📅 תור חדש נקבע!',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>תור חדש נקבע ✅</h2>
          <p><b>שם לקוח:</b> ${escapeHtml(appointment.customerName)}</p>
          <p><b>טלפון:</b> ${escapeHtml(appointment.customerPhone)}</p>
          <p><b>שירות:</b> ${escapeHtml(appointment.service)}</p>
          <p><b>תאריך:</b> ${escapeHtml(new Date(appointment.date).toLocaleDateString('he-IL'))}</p>
          <p><b>שעה:</b> ${escapeHtml(appointment.time)}</p>
        </div>
      `
    });

    console.log('✅ New appointment notification email sent');
    return { success: true };
  } catch (error) {
    const details = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    console.error('❌ New appointment email failed:', details);
    throw error;
  }
}

/* ===============================
   WhatsApp failure email
=================================*/
async function sendWhatsAppFailureEmail(data) {
  try {
    const recipients = getRecipients(true);

    await sendMail({
      to: recipients,
      subject: '⚠️ כשל בשליחת WhatsApp',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>שליחת הודעת WhatsApp נכשלה</h2>
          <p><b>טלפון:</b> ${escapeHtml(data.phone)}</p>
          <p><b>תוכן ההודעה:</b></p>
          <pre style="white-space:pre-wrap">${escapeHtml(data.message)}</pre>
          <hr>
          <p><b>שגיאה:</b> ${escapeHtml(data.error)}</p>
          <p><b>זמן:</b> ${escapeHtml(new Date().toLocaleString('he-IL'))}</p>
        </div>
      `
    });

    console.log('✅ WhatsApp failure notification email sent');
    return { success: true };
  } catch (error) {
    const details = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    console.error('❌ WhatsApp failure email failed:', details);
    throw error;
  }
}

module.exports = {
  verifyConnection,
  sendNewAppointmentEmail,
  sendWhatsAppFailureEmail
};
