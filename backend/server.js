process.env.TZ = process.env.TZ || 'Asia/Jerusalem';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const appointmentRoutes = require('./routes/appointmentRoutes');
const authRoutes = require('./routes/authRoutes');
const pushRoutes = require('./routes/pushRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const messageRoutes = require('./routes/messageRoutes');

const authController = require('./controllers/authController');
const cronService = require('./services/cronService');
const BusinessSettings = require('./models/BusinessSettings');

const app = express();

/* ========================
   MIDDLEWARE
======================== */
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://fadila-barber.netlify.app',
  'http://localhost:5001',
  'http://localhost:8080',
  'http://localhost:8088',
  'http://127.0.0.1:5001',
  'http://127.0.0.1:8080'
].filter(Boolean).map((origin) => origin.replace(/\/+$/, ''));

function isAllowedOrigin(origin) {
  const normalizedOrigin = origin?.replace(/\/+$/, '');
  if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) return true;

  try {
    const url = new URL(normalizedOrigin);
    const isSecureDevelopmentTunnel =
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.devtunnels.ms') ||
       url.hostname.endsWith('.trycloudflare.com'));

    return isSecureDevelopmentTunnel;
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders(res, filePath) {
    if (/\.(html|js|webmanifest)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString('ar', { timeZone: 'Asia/Jerusalem' })} - ${req.method} ${req.url}`);
  next();
});

/* ========================
   API ROUTES
======================== */
app.use('/api/appointments', appointmentRoutes);
app.use('/api/auth', authRoutes);
// Backward compatibility for already-installed PWA versions.
app.use('/api/admin', authRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/messages', messageRoutes);

/* ========================
   HEALTH CHECK
======================== */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'واجهة Fadila Barber تعمل',
    timestamp: new Date().toISOString(),
    businessTime: new Date().toLocaleString('ar', {
      timeZone: 'Asia/Jerusalem'
    }),
    timeZone: 'Asia/Jerusalem'
  });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'خادم Fadila Barber يعمل. استخدم رابط Netlify لواجهة التطبيق.',
    health: '/api/health'
  });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

/* ========================
   ERROR HANDLING
======================== */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'المسار غير موجود'
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal Server Error'
  });
});

/* ========================
   DEFAULT SETTINGS CREATION
======================== */
async function ensureSettings() {
  try {
    const exists = await BusinessSettings.findOne();

    if (!exists) {
      await BusinessSettings.create({
        workingHours: {
          sunday: { start: '09:00', end: '19:00', breaks: [], enabled: true },
          monday: { start: '09:00', end: '19:00', breaks: [], enabled: true },
          tuesday: { start: '09:00', end: '19:00', breaks: [], enabled: true },
          wednesday: { start: '09:00', end: '19:00', breaks: [], enabled: true },
          thursday: { start: '09:00', end: '19:00', breaks: [], enabled: true },
          friday: { start: '09:00', end: '14:00', breaks: [], enabled: true },
          saturday: { start: '09:00', end: '14:00', breaks: [], enabled: true }
        }
      });

      console.log('✅ Default business settings created');
    }
  } catch (err) {
    console.error('❌ Error in ensureSettings:', err);
  }
}

/* ========================
   INITIALIZATION & START SERVER
======================== */
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`\n💈 Fadila Barber Backend API running on port ${PORT}`);
  console.log(`🕒 Business timezone: ${process.env.TZ}`);
  connectDB()
    .then(async () => {
      await ensureSettings();
      await authController.createOwner();
      cronService.start();
      console.log('✅ Background initialization completed successfully');
    })
    .catch((err) => {
      console.error('❌ Failed to connect to DB during initialization:', err);
    });
});

/* ========================
   GRACEFUL SHUTDOWN
======================== */
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  cronService.stop();
  process.exit(0);
});

module.exports = app;
