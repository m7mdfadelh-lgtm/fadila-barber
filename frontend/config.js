const localHosts = ['localhost', '127.0.0.1'];
window.FADILA_API_URL = localHosts.includes(window.location.hostname)
  ? 'http://localhost:5001/api'
  : 'https://railway-deploy-production-adc6.up.railway.app/api';
