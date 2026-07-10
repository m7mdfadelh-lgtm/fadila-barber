const WHATSAPP_FOOTER = 'website:https://fadila-barber.netlify.app\nwaze:https://waze.com/ul/hsvbbm6j5p';

function withWhatsAppFooter(message) {
  return `${String(message || '').trim()}\n\n${WHATSAPP_FOOTER}`;
}

module.exports = {
  WHATSAPP_FOOTER,
  withWhatsAppFooter
};
