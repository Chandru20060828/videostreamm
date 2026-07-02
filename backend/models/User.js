const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// FIX Task 2: Added thumbnailUrl to downloadHistory so Downloads page can show it
const downloadHistorySchema = new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  videoTitle: String,
  downloadDate: { type: Date, default: Date.now },
  cloudinaryUrl: String,
  thumbnailUrl: { type: String, default: '' }   // <-- new field
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  avatar: { type: String, default: '' },

  // Subscription
  plan: { type: String, enum: ['free', 'bronze', 'silver', 'gold'], default: 'free' },
  planExpiry: { type: Date },

  // Theme preference - 'dark' is the default; users can switch to 'light',
  // 'auto' (time-based IST: light 10am-12pm, dark otherwise), or explicit 'dark'
  theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },

  // Download tracking
  downloadHistory: [downloadHistorySchema],
  lastDownloadDate: { type: Date },
  dailyDownloadCount: { type: Number, default: 0 },

  // Security - known devices for OTP bypass
  knownDevices: [{
    deviceId: String,
    deviceInfo: String,
    city: String,
    region: String,
    addedAt: { type: Date, default: Date.now }
  }],
  otpCode: String,
  otpExpiry: Date,
  otpPurpose: String,

  // Profile / preferences
  preferredLanguage: { type: String, default: 'en' },
  showLocation: { type: Boolean, default: false },
  city: String,
  region: String,

  // Razorpay
  razorpayOrderId: String,

  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.canDownload = function () {
  const limits = { free: 1, bronze: 5, silver: 15, gold: 9999 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!this.lastDownloadDate || new Date(this.lastDownloadDate) < today) {
    // New day — reset count
    return { allowed: true, remaining: limits[this.plan] };
  }

  const remaining = limits[this.plan] - this.dailyDownloadCount;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
};

module.exports = mongoose.model('User', userSchema);
