async function verifyConnection() {
  console.log('ℹ️ Email notifications are disabled. WhatsApp notifications are active.');
  return { success: true, disabled: true };
}

async function sendNewAppointmentEmail() {
  console.log('ℹ️ New appointment email skipped because email notifications are disabled.');
  return { success: true, skipped: true };
}

async function sendWhatsAppFailureEmail() {
  console.log('ℹ️ WhatsApp failure email skipped because email notifications are disabled.');
  return { success: true, skipped: true };
}

async function sendCancellationEmail() {
  console.log('ℹ️ Cancellation email skipped because email notifications are disabled.');
  return { success: true, skipped: true };
}

module.exports = {
  verifyConnection,
  sendNewAppointmentEmail,
  sendWhatsAppFailureEmail,
  sendCancellationEmail
};
