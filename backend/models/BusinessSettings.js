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
  }
});

module.exports = mongoose.model("BusinessSettings", businessSettingsSchema);
