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
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
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
    console.log('✅ Gmail email connection verified successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Gmail email verification failed:', error.message);
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
    console.error('❌ New appointment email failed:', error.message);
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
    console.error('❌ WhatsApp failure email failed:', error.message);
    throw error;
  }
}

module.exports = {
  verifyConnection,
  sendNewAppointmentEmail,
  sendWhatsAppFailureEmail
};
