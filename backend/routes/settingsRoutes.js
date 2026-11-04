const express = require("express");
const router = express.Router();
const BusinessSettings = require("../models/BusinessSettings");
const { protect, ownerOnly } = require("../middleware/authMiddleware");

router.get("/", protect, async (req,res)=>{
  const settings = await BusinessSettings.findOne();
  res.json(settings);
});

function isIsoDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || value[4] !== '-' || value[7] !== '-') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.put("/", protect, ownerOnly, async (req,res)=>{
  const dateOverrides = Array.isArray(req.body.dateOverrides) ? req.body.dateOverrides : [];
  const validOverrides = dateOverrides.every((item) => {
    if (item.date) return isIsoDate(item.date);
    return isIsoDate(item.startDate) && isIsoDate(item.endDate) && item.startDate <= item.endDate;
  });
  if (!validOverrides) return res.status(400).json({ success: false, error: 'إعدادات التواريخ الخاصة غير صالحة' });
  const settings = await BusinessSettings.findOneAndUpdate(
    {},
    { workingHours: req.body.workingHours, dateOverrides },
    { new:true, upsert:true, runValidators:true }
  );
  res.json(settings);
});

module.exports = router;
