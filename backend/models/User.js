const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['owner', 'customer'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, match: /^05\d{8}$/ },
  active: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return { id: this._id, username: this.username, role: this.role, name: this.name, phone: this.phone };
};

module.exports = mongoose.model('User', userSchema);
