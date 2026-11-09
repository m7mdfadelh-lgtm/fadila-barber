const mongoose = require('mongoose');

const conversationMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, maxlength: 400 },
  readAt: { type: Date, default: null }
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  messages: { type: [conversationMessageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

conversationSchema.index({ customer: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
