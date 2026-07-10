const mongoose = require('mongoose');

const whatsAppQueueSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  fingerprint: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent'],
    default: 'pending',
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastAttemptAt: Date,
  sentAt: Date,
  lastError: {
    type: String,
    maxlength: 2000
  }
}, {
  timestamps: true
});

whatsAppQueueSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('WhatsAppQueue', whatsAppQueueSchema);
