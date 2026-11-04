const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { protect } = require('../middleware/authMiddleware');

/* GET ALL SERVICES */
router.get('/', protect, async (req, res) => {
  const services = await Service.find();
  res.json(services);
});

/* ADD SERVICE */
router.post("/", protect, async (req, res) => {
  const { name, price, duration } = req.body;

  const service = await Service.create({
    name,
    price,
    duration
  });

  res.json(service);
});

/* UPDATE SERVICE */
router.put('/:id', protect, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const price = Number(req.body.price);
  const duration = Number(req.body.duration);
  if (!name) return res.status(400).json({ success: false, error: 'اسم الخدمة مطلوب' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, error: 'سعر الخدمة غير صالح' });
  if (!Number.isInteger(duration) || duration < 1) return res.status(400).json({ success: false, error: 'مدة الخدمة غير صالحة' });
  const service = await Service.findByIdAndUpdate(
    req.params.id,
    { name, price, duration },
    { new: true, runValidators: true }
  );
  if (!service) return res.status(404).json({ success: false, error: 'لم يتم العثور على الخدمة' });
  res.json(service);
});

/* DELETE SERVICE */
router.delete('/:id', protect, async (req, res) => {
  await Service.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
