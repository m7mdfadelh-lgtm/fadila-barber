const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema({
  image: {
    type: Buffer,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  order: {
    type: Number
  }
}, { timestamps: true });

module.exports = mongoose.model("Gallery", gallerySchema);