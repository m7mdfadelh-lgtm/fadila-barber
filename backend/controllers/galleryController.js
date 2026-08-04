const Gallery = require("../models/Gallery");
const multer = require("multer");

// In-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

exports.upload = upload;

// Upload image to MongoDB
exports.addImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم رفع ملف" });
    }

    const newImage = await Gallery.create({
      image: req.file.buffer,
      contentType: req.file.mimetype
    });

    res.json({ success: true, id: newImage._id });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Fetch all images
exports.getImages = async (req, res) => {
  try {
    const images = await Gallery.find().sort({ createdAt: -1 });

    const formatted = images.map(img => ({
      _id: img._id,
      image: `data:${img.contentType};base64,${img.image.toString("base64")}`
    }));

    res.json(formatted);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete image
exports.deleteImage = async (req, res) => {
  try {
    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
