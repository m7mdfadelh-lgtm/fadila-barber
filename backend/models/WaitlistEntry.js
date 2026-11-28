const mongoose = require('mongoose');

const waitlistEntrySchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerName: { type: String, required: true },
  service: { type: String, required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  notifiedAt: { type: Date, default: null }
}, { timestamps: true });

waitlistEntrySchema.index({ customer: 1, service: 1, date: 1 }, { unique: true });
waitlistEntrySchema.index({ date: 1, service: 1, notifiedAt: 1 });

module.exports = mongoose.model('WaitlistEntry', waitlistEntrySchema);
