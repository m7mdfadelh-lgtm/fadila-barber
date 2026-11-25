const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  phone: { type: String, default: '' },
  active: { type: Boolean, default: true },
  status: { type: String, enum: ['sent', 'partial', 'failed', 'no-subscription'], required: true },
  attemptedDevices: { type: Number, default: 0 },
  sentDevices: { type: Number, default: 0 },
  failedDevices: { type: Number, default: 0 }
}, { _id: false });

const pushCampaignSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  audience: { type: String, enum: ['all', 'single'], required: true },
  title: { type: String, required: true, maxlength: 80 },
  body: { type: String, required: true, maxlength: 240 },
  recipientCount: { type: Number, required: true },
  sentDevices: { type: Number, default: 0 },
  failedDevices: { type: Number, default: 0 },
  recipients: { type: [recipientSchema], default: [] }
}, { timestamps: true });

pushCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PushCampaign', pushCampaignSchema);
