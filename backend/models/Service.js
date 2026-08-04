const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    required: true,
    default: 30
  }
}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);
