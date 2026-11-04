const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerName: { type: String, required: true, trim: true, maxlength: 80 },
  rating: { type: Number, required: true, min: 1, max: 5 },
  suggestion: { type: String, required: true, trim: true, maxlength: 1000 },
  visibility: { type: String, enum: ['pending', 'published', 'hidden'], default: 'pending', index: true }
}, { timestamps: true });

feedbackSchema.index({ visibility: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
