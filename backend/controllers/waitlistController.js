const WaitlistEntry = require('../models/WaitlistEntry');
const Service = require('../models/Service');
const { getJerusalemDateString } = require('../utils/timeZone');

exports.join = async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ success: false, error: 'هذه الخدمة متاحة للزبائن فقط' });
  const service = String(req.body.service || '').trim();
  const date = String(req.body.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < getJerusalemDateString()) return res.status(400).json({ success: false, error: 'يرجى اختيار تاريخ صالح' });
  if (!await Service.exists({ name: service })) return res.status(400).json({ success: false, error: 'الخدمة غير متاحة' });
  try {
    const entry = await WaitlistEntry.findOneAndUpdate({ customer: req.user._id, service, date }, { $setOnInsert: { customerName: req.user.name } }, { upsert: true, new: true, runValidators: true });
    return res.status(201).json({ success: true, data: entry });
  } catch (error) {
    if (error.code === 11000) return res.json({ success: true, message: 'أنت مسجل بالفعل في قائمة الانتظار لهذا اليوم' });
    throw error;
  }
};

exports.list = async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ success: false, error: 'هذه الخدمة متاحة لصاحب المحل فقط' });
  const entries = await WaitlistEntry.find({ date: { $gte: getJerusalemDateString() } }).sort({ date: 1, createdAt: 1 }).lean();
  res.json({ success: true, data: entries });
};

exports.remove = async (req, res) => {
  const query = { _id: req.params.id };
  if (req.user.role !== 'owner') query.customer = req.user._id;
  const entry = await WaitlistEntry.findOneAndDelete(query);
  if (!entry) return res.status(404).json({ success: false, error: 'لم يتم العثور على الطلب' });
  res.json({ success: true });
};
