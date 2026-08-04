const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Appointment = require('../models/Appointment');

const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
}

exports.login = async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = await User.findOne({ username, active: true });
  if (!user || !(await user.comparePassword(String(req.body.password || '')))) {
    return res.status(400).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  res.json({ success: true, token: sign(user), user: user.toSafeObject() });
};

exports.me = (req, res) => res.json({ success: true, user: req.user.toSafeObject() });

exports.createCustomer = async (req, res) => {
  try {
    const user = await User.create({
      username: String(req.body.username || '').trim().toLowerCase(),
      password: String(req.body.password || ''),
      role: 'customer',
      name: String(req.body.name || '').trim(),
      phone: String(req.body.phone || '').replace(/\D/g, '')
    });
    await Appointment.updateMany(
      { customerPhone: user.phone, $or: [{ customer: { $exists: false } }, { customer: null }] },
      { $set: { customer: user._id, customerName: user.name } }
    );
    res.status(201).json({ success: true, user: user.toSafeObject() });
  } catch (error) {
    const message = error.code === 11000 ? 'اسم المستخدم موجود مسبقاً' : (error.message || 'تعذر إنشاء حساب الزبون');
    res.status(400).json({ success: false, error: message });
  }
};

exports.listCustomers = async (req, res) => {
  const users = await User.find({ role: 'customer', active: true }).sort({ name: 1 });
  res.json({ success: true, data: users.map((user) => user.toSafeObject()) });
};

exports.createOwner = async () => {
  const existing = await User.findOne({ role: 'owner' });
  if (existing) return existing;
  const username = process.env.OWNER_USERNAME || 'owner';
  const legacy = await User.db.collection('admins').findOne({ username });
  if (legacy?.password) {
    await User.collection.insertOne({ username, password: legacy.password, role: 'owner', name: process.env.OWNER_NAME || 'صاحب المحل', phone: process.env.OWNER_PHONE || '0500000000', active: true, createdAt: new Date(), updatedAt: new Date() });
    return User.findOne({ role: 'owner' });
  }
  const password = process.env.OWNER_PASSWORD;
  if (!password) throw new Error('OWNER_PASSWORD is required when no legacy owner exists');
  return User.create({ username, password, role: 'owner', name: process.env.OWNER_NAME || 'صاحب المحل', phone: process.env.OWNER_PHONE || '0500000000' });
};
