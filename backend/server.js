process.env.TZ = process.env.TZ || 'Asia/Jerusalem';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const adminController = require('./controllers/adminController');
const cronService = require('./services/cronService');
const emailService = require('./services/emailService');
const BusinessSettings = require('./models/BusinessSettings');

const app = express();

/* ========================
   MIDDLEWARE
======================== */
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} - ${req.method} ${req.url}`);
  next();
});

/* ========================
   API ROUTES
======================== */
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);

/* ========================
   HEALTH CHECK
======================== */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Fadila Barber API is running',
    timestamp: new Date().toISOString(),
    businessTime: new Date().toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem'
    }),
    timeZone: 'Asia/Jerusalem',
    wahaWebhook: '/api/webhooks/waha'
  });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Fadila Barber backend is running. Use the Netlify URL for the frontend.',
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
    error: 'Route not found'
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
  console.log('📨 WAHA approval webhook: /api/webhooks/waha');

  emailService.verifyConnection().catch((err) => {
    console.error('❌ Unexpected email verification error:', err.message);
  });

  connectDB()
    .then(async () => {
      await ensureSettings();
      await adminController.createAdmin();
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
