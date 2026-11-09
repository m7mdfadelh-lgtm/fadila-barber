const express = require("express");
const router = express.Router();
const galleryController = require("../controllers/galleryController");
const { protect, ownerOnly } = require("../middleware/authMiddleware");

router.get("/", galleryController.getImages);

router.post(
  "/",
  protect,
  ownerOnly,
  galleryController.upload.single("image"),
  galleryController.addImage
);

router.put("/reorder", protect, ownerOnly, galleryController.reorderImages);
router.delete("/:id", protect, ownerOnly, galleryController.deleteImage);

module.exports = router;