const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  displayName: { type: String, required: [true, 'يرجى كتابة الاسم الظاهر'], trim: true, minlength: 2, maxlength: 50 },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  text: { type: String, required: [true, 'يرجى كتابة الفيدباك'], trim: true, maxlength: 500 }
}, { timestamps: true });

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
