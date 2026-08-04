const express = require("express");
const router = express.Router();
const galleryController = require("../controllers/galleryController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", galleryController.getImages);

router.post(
  "/",
  protect,
  galleryController.upload.single("image"),
  galleryController.addImage
);

router.delete("/:id", protect, galleryController.deleteImage);

module.exports = router;