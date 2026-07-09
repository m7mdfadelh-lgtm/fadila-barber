require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');

const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const adminController = require('./controllers/adminController');
const cronService = require('./services/cronService');
const BusinessSettings = require('./models/BusinessSettings');

const app = express();

/* ========================
   MIDDLEWARE
======================== */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString('he-IL')} - ${req.method} ${req.url}`);
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

/* ========================
   HEALTH CHECK
======================== */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Fadila Barber API is running',
    timestamp: new Date().toISOString()
  });
});

/* ========================
   SERVE FRONTEND FILES
======================== */
const frontendCandidates = [
  path.resolve(__dirname, '../frontend'),
  path.resolve(process.cwd(), 'frontend'),
  path.resolve(process.cwd(), '../frontend')
];

const frontendPath = frontendCandidates.find((p) => fs.existsSync(p));

app.get('/favicon.ico', (req, res) => res.status(204).end());

if (frontendPath) {
  console.log(`✅ Serving frontend from: ${frontendPath}`);

  app.use(express.static(frontendPath));

  app.get('/', (req, res, next) => {
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  app.get('/:page.html', (req, res, next) => {
    res.sendFile(path.join(frontendPath, `${req.params.page}.html`), (err) => {
      if (err) next();
    });
  });
} else {
  console.warn('⚠️ Frontend folder was not found. API routes will still work.');
  console.warn(`Checked paths: ${frontendCandidates.join(', ')}`);
}

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
  console.log(`\n💈 Fadila Barber Server Running on port ${PORT}`);

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