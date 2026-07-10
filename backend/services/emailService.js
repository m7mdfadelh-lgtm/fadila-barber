const nodemailer = require('nodemailer');

const REQUIRED_EMAIL_ENV = [
  'EMAIL_USER',
  'EMAIL_APP_PASSWORD',
  'BUSINESS_OWNER_EMAIL'
];

function getMissingEmailEnv() {
  return REQUIRED_EMAIL_ENV.filter((key) => !process.env[key]);
}

function getRecipients(includeAdminAlert = false) {
  const recipients = [process.env.BUSINESS_OWNER_EMAIL];

  if (includeAdminAlert && process.env.ADMIN_ALERT_EMAIL) {
    recipients.push(process.env.ADMIN_ALERT_EMAIL);
  }

  return [...new Set(recipients.filter(Boolean))];
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

  if (missing.length > 0) {
    const message = `Missing email environment variables: ${missing.join(', ')}`;
    console.error(`❌ ${message}`);
    return { success: false, error: message };
  }

  try {
    await transporter.verify();
    console.log('✅ Email SMTP connection verified successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Email SMTP verification failed:', error.message);
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
    ...options
  });

  console.log(`✅ Email sent successfully: ${info.messageId}`);
  return info;
}

/* ===============================
   New appointment email
=================================*/
async function sendNewAppointmentEmail(appointment) {
  try {
    const recipients = getRecipients(false);

    await sendMail({
      to: recipients.join(', '),
      subject: '📅 תור חדש נקבע!',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>תור חדש נקבע ✅</h2>
          <p><b>שם לקוח:</b> ${appointment.customerName}</p>
          <p><b>טלפון:</b> ${appointment.customerPhone}</p>
          <p><b>שירות:</b> ${appointment.service}</p>
          <p><b>תאריך:</b> ${new Date(appointment.date).toLocaleDateString('he-IL')}</p>
          <p><b>שעה:</b> ${appointment.time}</p>
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
      to: recipients.join(', '),
      subject: '⚠️ כשל בשליחת WhatsApp',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>שליחת הודעת WhatsApp נכשלה</h2>
          <p><b>טלפון:</b> ${data.phone}</p>
          <p><b>תוכן ההודעה:</b></p>
          <pre style="white-space:pre-wrap">${data.message}</pre>
          <hr>
          <p><b>שגיאה:</b> ${data.error}</p>
          <p><b>זמן:</b> ${new Date().toLocaleString('he-IL')}</p>
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
