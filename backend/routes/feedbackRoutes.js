const router = require('express').Router();
const Feedback = require('../models/Feedback');
const BusinessSettings = require('../models/BusinessSettings');
const { protect, ownerOnly } = require('../middleware/authMiddleware');

router.get('/public', async (req, res) => {
  const [data, settings] = await Promise.all([
    Feedback.find({ visibility: 'published' }).select('customerName rating suggestion createdAt').sort({ createdAt: -1 }).limit(100).lean(),
    BusinessSettings.findOne().select('feedbackEnabled').lean()
  ]);
  res.json({ success: true, data, submissionsEnabled: settings?.feedbackEnabled !== false });
});

router.post('/', protect, async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه الخدمة متاحة للزبائن فقط' });
  const rating = Number(req.body.rating);
  const suggestion = String(req.body.suggestion || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, error: 'يرجى اختيار تقييم من نجمة إلى خمس نجوم' });
  }
  if (!suggestion || suggestion.length > 1000) {
    return res.status(400).json({ success: false, error: 'يرجى كتابة ملاحظة لا تتجاوز 1000 حرف' });
  }
  const settings = await BusinessSettings.findOne().select('feedbackEnabled').lean();
  if (settings?.feedbackEnabled === false) {
    return res.status(403).json({ success: false, error: 'استقبال التقييمات متوقف حالياً' });
  }
  const feedback = await Feedback.create({
    customer: req.user._id,
    customerName: req.user.name,
    rating,
    suggestion
  });
  res.status(201).json({ success: true, data: { id: feedback._id, visibility: feedback.visibility } });
});

router.get('/admin', protect, ownerOnly, async (req, res) => {
  const [data, settings] = await Promise.all([
    Feedback.find().sort({ createdAt: -1 }).lean(),
    BusinessSettings.findOne().select('feedbackEnabled').lean()
  ]);
  res.json({ success: true, data, submissionsEnabled: settings?.feedbackEnabled !== false });
});

router.put('/admin/settings', protect, ownerOnly, async (req, res) => {
  if (typeof req.body.submissionsEnabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'الإعداد غير صالح' });
  }
  const settings = await BusinessSettings.findOneAndUpdate(
    {},
    { $set: { feedbackEnabled: req.body.submissionsEnabled } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, submissionsEnabled: settings.feedbackEnabled !== false });
});

router.put('/:id', protect, ownerOnly, async (req, res) => {
  if (!['published', 'hidden', 'pending'].includes(req.body.visibility)) {
    return res.status(400).json({ success: false, error: 'حالة النشر غير صالحة' });
  }
  const item = await Feedback.findByIdAndUpdate(
    req.params.id,
    { $set: { visibility: req.body.visibility } },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ success: false, error: 'لم يتم العثور على التقييم' });
  res.json({ success: true, data: item });
});

router.delete('/:id', protect, ownerOnly, async (req, res) => {
  const item = await Feedback.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'لم يتم العثور على التقييم' });
  res.json({ success: true });
});

module.exports = router;
