const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 80 },
  body: { type: String, required: true, maxlength: 500 },
  url: { type: String, default: './index.html' },
  tag: { type: String, required: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  actionType: { type: String, enum: ['', 'change-request'], default: '' },
  readAt: { type: Date, default: null, index: true }
}, { timestamps: true });

messageSchema.index({ user: 1, tag: 1 }, { unique: true });
messageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
