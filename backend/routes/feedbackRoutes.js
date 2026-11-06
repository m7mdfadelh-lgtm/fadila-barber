const router = require('express').Router();
const Feedback = require('../models/Feedback');
const { protect, ownerOnly } = require('../middleware/authMiddleware');
const pushService = require('../services/pushService');

router.get('/', async (req, res) => {
  try {
    const [items, totals] = await Promise.all([
      Feedback.find().sort({ createdAt: -1 }).lean(),
      Feedback.aggregate([{ $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }])
    ]);
    const averageRating = totals.length ? Math.round(totals[0].average * 10) / 10 : 0;
    res.json({ success: true, data: items, averageRating, ratingCount: totals[0]?.count || 0 });
  } catch (error) {
    console.error('Feedback load failed:', error);
    res.status(500).json({ success: false, error: 'تعذر تحميل التقييمات' });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه الخدمة متاحة للزبائن فقط' });

    const displayName = String(req.body.displayName || '').trim();
    const text = String(req.body.text || '').trim();
    const rating = Number(req.body.rating);
    if (displayName.length < 2 || displayName.length > 50) {
      return res.status(400).json({ success: false, error: 'يجب أن يتراوح الاسم الظاهر بين حرفين و50 حرفاً' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار تقييم من نجمة إلى خمس نجوم' });
    }
    if (!text || text.length > 500) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة فيدباك لا يتجاوز 500 حرف' });
    }

    const feedback = await Feedback.create({ user: req.user._id, displayName, rating, text });
    const notice = `${displayName} قيّم الخدمة ${rating}/5: ${text.slice(0, 160)}`;
    try {
      await pushService.sendToOwners({
        title: 'تقييم جديد على Fadila',
        body: notice,
        messageBody: notice,
        url: './dashboard.html',
        tag: `feedback-${feedback._id}`,
        actionType: 'feedback'
      });
    } catch (notificationError) {
      console.error('New feedback notification failed:', notificationError);
    }

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    console.error('Feedback publish failed:', error);
    res.status(500).json({ success: false, error: 'تعذر نشر الفيدباك' });
  }
});

router.delete('/:id', protect, ownerOnly, async (req, res) => {
  try {
    const deleted = await Feedback.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'لم يتم العثور على الفيدباك' });
    res.json({ success: true });
  } catch (error) {
    console.error('Feedback deletion failed:', error);
    res.status(500).json({ success: false, error: 'تعذر حذف الفيدباك' });
  }
});

module.exports = router;
