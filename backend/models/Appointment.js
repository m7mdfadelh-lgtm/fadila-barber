const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  customerName: {
    type: String,
    required: [true, 'اسم الزبون مطلوب'],
    trim: true,
    minlength: [2, 'يجب أن يحتوي الاسم على حرفين على الأقل'],
    maxlength: [50, 'الاسم طويل جداً']
  },

  customerPhone: {
    type: String,
    required: [true, 'رقم الهاتف مطلوب'],
    match: [/^05\d{8}$/, 'رقم الهاتف غير صالح (05XXXXXXXX)']
  },

  service: {
    type: String,
    required: [true, 'يرجى اختيار نوع الخدمة']
  },

  date: {
    type: Date,
    required: [true, 'تاريخ الموعد مطلوب']
  },

  duration: {
    type: Number,
    required: true
  },

  time: {
    type: String,
    required: [true, 'ساعة الموعد مطلوبة'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'صيغة الساعة غير صالحة']
  },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'pending'
  },

  approvalRequestedAt: {
    type: Date,
    default: null
  },

  approvalDecisionAt: {
    type: Date,
    default: null
  },

  approvalDecision: {
    type: String,
    enum: ['approved', 'rejected', null],
    default: null
  },

  clientReminderSent: {
    type: Boolean,
    default: false
  },

  ownerReminderSent: {
    type: Boolean,
    default: false
  },

  clientReminderScheduledFor: { type: Date, default: null },
  ownerReminderScheduledFor: { type: Date, default: null },

  ownerBookingNotificationSent: {
    type: Boolean,
    default: false
  },

  clientBookingNotificationSent: {
    type: Boolean,
    default: false
  },

  newAppointmentEmailSent: {
    type: Boolean,
    default: false
  },

  upcomingEmailSent: {
    type: Boolean,
    default: false
  },

  notes: {
    type: String,
    maxlength: [500, 'الملاحظات محدودة بـ500 حرف']
  },

  changeRequest: {
    text: { type: String, maxlength: 500, default: '' },
    requestedService: { type: String, default: '' },
    requestedDate: { type: String, default: '' },
    requestedTime: { type: String, default: '' },
    notificationTag: { type: String, default: '' },
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected', 'adjusted'], default: 'none' },
    requestedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null }
  }
}, {
  timestamps: true
});

appointmentSchema.index({ date: 1, time: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ customerPhone: 1 });
appointmentSchema.index({ status: 1, approvalRequestedAt: 1 });

appointmentSchema.statics.findByDate = function(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return this.find({
    date: { $gte: start, $lte: end },
    status: { $ne: 'cancelled' }
  }).sort({ time: 1 });
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
