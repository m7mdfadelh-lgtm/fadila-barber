const express = require("express");
const router = express.Router();
const BusinessSettings = require("../models/BusinessSettings");
const { protect, ownerOnly } = require("../middleware/authMiddleware");

router.get("/", protect, async (req,res)=>{
  const settings = await BusinessSettings.findOne();
  res.json(settings);
});

router.put("/", protect, ownerOnly, async (req,res)=>{
  const settings = await BusinessSettings.findOneAndUpdate(
    {},
    { workingHours: req.body.workingHours, dateOverrides: req.body.dateOverrides || [] },
    { new:true, upsert:true, runValidators:true }
  );
  res.json(settings);
});

module.exports = router;
