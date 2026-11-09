const Gallery = require("../models/Gallery");
const multer = require("multer");

// In-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

exports.upload = upload;

// Upload image to MongoDB
exports.addImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم رفع ملف" });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
      return res.status(400).json({ error: "صيغة الصورة غير مدعومة" });
    }

    const count = await Gallery.countDocuments();
    const lastOrdered = await Gallery.findOne().sort({ order: -1 }).select("order").lean();
    const order = Number.isFinite(lastOrdered?.order) ? lastOrdered.order + 1 : count;
    const newImage = await Gallery.create({
      image: req.file.buffer,
      contentType: req.file.mimetype,
      order
    });

    res.json({ success: true, id: newImage._id });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Fetch all images
exports.getImages = async (req, res) => {
  try {
    const images = await Gallery.find().sort({ order: 1, createdAt: -1 });

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

// Save the requested image order. The request must include every current image exactly once.
exports.reorderImages = async (req, res) => {
  try {
    const imageIds = req.body.imageIds;
    if (!Array.isArray(imageIds) || imageIds.some(id => !/^[a-f0-9]{24}$/i.test(String(id))) || new Set(imageIds.map(String)).size !== imageIds.length) {
      return res.status(400).json({ error: "ترتيب الصور غير صالح" });
    }

    const currentCount = await Gallery.countDocuments();
    if (imageIds.length !== currentCount) {
      return res.status(400).json({ error: "قائمة الصور لا تطابق صور المعرض الحالية" });
    }

    if (imageIds.length) {
      const matches = await Gallery.countDocuments({ _id: { $in: imageIds } });
      if (matches !== imageIds.length) {
        return res.status(400).json({ error: "توجد صورة غير موجودة في المعرض" });
      }
      await Promise.all(imageIds.map((id, order) =>
        Gallery.updateOne({ _id: id }, { $set: { order } })
      ));
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
