const mongoose = require("mongoose");

const breakSchema = {
  start: String,
  end: String
};

const daySchema = {
  start: String,
  end: String,
  breaks: [breakSchema],
  enabled: Boolean
};

const dateOverrideSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  start: String,
  end: String,
  breaks: [breakSchema],
  enabled: { type: Boolean, default: true }
}, { _id: false });

const businessSettingsSchema = new mongoose.Schema({
  vapidPublicKey: { type: String, select: false },
  vapidPrivateKey: { type: String, select: false },
  workingHours: {
    sunday: daySchema,
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema
  },
  dateOverrides: { type: [dateOverrideSchema], default: [] }
});

module.exports = mongoose.model("BusinessSettings", businessSettingsSchema);
