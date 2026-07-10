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

/* ===============================
   New appointment notification
================================= */
async function sendNewAppointmentEmail(appointment) {
  try {
    const recipients = getRecipients(false);
    const appointmentDate = new Date(appointment.date);

    await sendMail({
      to: recipients,
      subject: '📅 תור חדש נקבע!',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;max-width:620px;margin:auto">
          <div style="background:#111827;color:#ffffff;padding:18px 22px;border-radius:12px 12px 0 0">
            <h2 style="margin:0">תור חדש נקבע ✅</h2>
          </div>

          <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p><b>שם לקוח:</b> ${escapeHtml(appointment.customerName)}</p>
            <p><b>טלפון:</b> ${escapeHtml(appointment.customerPhone)}</p>
            <p><b>שירות:</b> ${escapeHtml(appointment.service)}</p>
            <p><b>תאריך:</b> ${escapeHtml(appointmentDate.toLocaleDateString('he-IL'))}</p>
            <p><b>שעה:</b> ${escapeHtml(appointment.time)}</p>
            <p><b>סטטוס:</b> ${escapeHtml(appointment.status || 'confirmed')}</p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#6b7280;font-size:13px;margin:0">
              ההודעה נשלחה אוטומטית ממערכת Fadila Barber.
            </p>
          </div>
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
   WhatsApp failure notification
================================= */
async function sendWhatsAppFailureEmail(data) {
  try {
    const recipients = getRecipients(true);

    await sendMail({
      to: recipients,
      subject: '⚠️ כשל בשליחת WhatsApp',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;max-width:620px;margin:auto">
          <div style="background:#991b1b;color:#ffffff;padding:18px 22px;border-radius:12px 12px 0 0">
            <h2 style="margin:0">שליחת הודעת WhatsApp נכשלה</h2>
          </div>

          <div style="border:1px solid #fecaca;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p><b>טלפון:</b> ${escapeHtml(data.phone)}</p>

            <p><b>תוכן ההודעה:</b></p>
            <pre style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;padding:14px;border-radius:8px;font-family:Arial,sans-serif">${escapeHtml(data.message)}</pre>

            <p><b>פרטי השגיאה:</b></p>
            <pre style="white-space:pre-wrap;background:#fef2f2;border:1px solid #fecaca;padding:14px;border-radius:8px;font-family:Arial,sans-serif;color:#991b1b">${escapeHtml(data.error)}</pre>

            <p><b>זמן:</b> ${escapeHtml(new Date().toLocaleString('he-IL'))}</p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#6b7280;font-size:13px;margin:0">
              יש לבדוק את חיבור WAHA ואת הגדרות הסשן.
            </p>
          </div>
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
