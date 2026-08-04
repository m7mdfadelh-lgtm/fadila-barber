const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';

exports.protect = async (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) throw new Error('Missing token');
    const payload = jwt.verify(authorization.slice(7), JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.active) throw new Error('Invalid user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول من جديد' });
  }
};

exports.ownerOnly = (req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ success: false, error: 'هذه العملية متاحة لصاحب المحل فقط' });
  }
  next();
};
