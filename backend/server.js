require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const settingsRoutes = require('./routes/settingsRoutes'); // ✅ חדש

const adminController = require('./controllers/adminController');
const cronService = require('./services/cronService');
const BusinessSettings = require('./models/BusinessSettings'); // ✅ חדש

const app = express();

/* ========================
   MIDDLEWARE
======================== */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString('he-IL')} - ${req.method} ${req.url}`);
  next();
});

/* ========================
   ROUTES
======================== */

app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/settings', settingsRoutes); // ✅ חדש

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
  const exists = await BusinessSettings.findOne();

  if (!exists) {
    await BusinessSettings.create({
  workingHours: {
    sunday:    { start:"09:00", end:"19:00", breaks:[], enabled:true },
    monday:    { start:"09:00", end:"19:00", breaks:[], enabled:true },
    tuesday:   { start:"09:00", end:"19:00", breaks:[], enabled:true },
    wednesday: { start:"09:00", end:"19:00", breaks:[], enabled:true },
    thursday:  { start:"09:00", end:"19:00", breaks:[], enabled:true },
    friday:    { start:"09:00", end:"14:00", breaks:[], enabled:true },
    saturday:  { start:"09:00", end:"14:00", breaks:[], enabled:true }
  }
});

    console.log("✅ Default business settings created");
  }
}

/* ========================
   START SERVER
======================== */

const PORT = process.env.PORT || 5001;

connectDB()
  .then(async () => {

    // ✅ יצירת שעות פעילות אם לא קיימות
    await ensureSettings();

    // ✅ יצירת owner אם לא קיים
    await adminController.createAdmin();

    // ✅ הפעלת cron
    cronService.start();

    app.listen(PORT, () => {
      console.log('\n💈 Fadila Barber Server Running');
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`❤️ Health: http://localhost:${PORT}/api/health\n`);
    });

  })
  .catch((err) => {
    console.error('❌ Failed to start server:', err);
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
