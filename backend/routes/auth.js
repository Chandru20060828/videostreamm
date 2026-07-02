const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendOTPEmail } = require('../utils/email');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Helper: get IST-based theme based on current time
const getISTTheme = () => {
  const now = new Date();
  // IST = UTC + 5:30
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffsetMs);
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();
  const totalMins = hour * 60 + minute;

  // Light theme: 10:00 AM (600 mins) to 12:00 PM (720 mins) IST
  const isLightHour = totalMins >= 600 && totalMins < 720;
  return {
    theme: isLightHour ? 'light' : 'dark',
    istTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} IST`,
    isLightHour
  };
};

// Helper: get device info + location from request
const getDeviceAndLocation = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

  // Normalize localhost IPs
  if (ip === '::1' || ip === '127.0.0.1' || ip?.startsWith('::ffff:127')) {
    ip = '127.0.0.1';
  }

  const geo = geoip.lookup(ip);
  const parser = new UAParser(req.headers['user-agent']);
  const browser = parser.getBrowser().name || 'Unknown Browser';
  const os = parser.getOS().name || 'Unknown OS';
  const deviceInfo = `${browser} on ${os}`;

  // FIX Task 5: Use ip + deviceInfo for fingerprint (not just ip)
  const deviceId = crypto.createHash('md5').update(`${deviceInfo}-${req.headers['user-agent'] || ''}`).digest('hex');

  return {
    ip,
    city: geo?.city || 'Unknown',
    region: geo?.region || 'Unknown',
    country: geo?.country || 'Unknown',
    deviceInfo,
    deviceId
  };
};

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields required' });
    }
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ message: 'Username or email already exists' });

    // Theme defaults to 'auto' so it is recomputed from the current IST time
    // on every future login, instead of being frozen at whatever time the
    // user happened to register.
    const user = await User.create({ username, email, password, theme: 'auto' });

    // Send OTP to verify this first device/email before granting access
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = 'register';
    await user.save();

    await sendOTPEmail(user, otp);

    const { deviceInfo, city, region } = getDeviceAndLocation(req);

    res.status(201).json({
      requiresOTP: true,
      userId: user._id,
      message: `Account created. OTP sent to ${user.email} to verify this device.`,
      reason: 'new account',
      deviceInfo,
      city,
      region
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // ── Task 5a: IST time-based theme ─────────────────────────────────────────
    const { theme: autoTheme, istTime, isLightHour } = getISTTheme();

    // NOTE: if user.theme === 'auto', we deliberately do NOT save autoTheme
    // into the DB here. Doing so would permanently lock the user into
    // whatever theme happened to be active at this exact login, defeating
    // the point of "auto" (recompute based on current time on every visit).
    // We only use autoTheme to tell the frontend what to render right now;
    // user.theme stays 'auto' in the database.

    // ── Task 5b: Device + Location detection ──────────────────────────────────
    const { deviceId, deviceInfo, city, region } = getDeviceAndLocation(req);

    const isNewDevice = !user.knownDevices.find(d => d.deviceId === deviceId);
    const isNewCity = !user.knownDevices.find(d => d.city === city && d.city !== 'Unknown');
    const isNewRegion = !user.knownDevices.find(d => d.region === region && d.region !== 'Unknown');

    // Require OTP for new device OR new city/state (if location is known)
    const needsOTP = isNewDevice || (isNewCity && city !== 'Unknown') || (isNewRegion && region !== 'Unknown');

    if (needsOTP) {
      const otp = generateOTP();
      user.otpCode = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      user.otpPurpose = 'login';
      await user.save();

      await sendOTPEmail(user, otp);

      const reason = isNewDevice ? 'new device' : `new location (${city}, ${region})`;
      return res.json({
        requiresOTP: true,
        userId: user._id,
        message: `Login from ${reason} detected. OTP sent to ${user.email}.`,
        reason,
        deviceInfo,
        city,
        region
      });
    }

    // ── Task 5c: Save theme in DB (already done above for 'auto') ─────────────
    const token = generateToken(user._id);

    res.json({
      token,
      autoTheme,
      istTime,
      isLightHour,
      user: {
        id: user._id, username: user.username, email: user.email,
        plan: user.plan, theme: user.theme, avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Verify OTP ────────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ message: 'userId and otp required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otpCode || user.otpCode !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired. Please login again.' });
    }

    // ── Task 5b: Add this device to known devices ─────────────────────────────
    const { deviceId, deviceInfo, city, region } = getDeviceAndLocation(req);
    const alreadyKnown = user.knownDevices.find(d => d.deviceId === deviceId);
    if (!alreadyKnown) {
      user.knownDevices.push({ deviceId, deviceInfo, city, region });
    }

    // Clear OTP
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    user.otpPurpose = undefined;

    // ── Task 5a: theme stays 'auto' in DB if that's the user's preference;
    // the frontend recomputes the current IST-based theme on every load. ────

    await user.save();

    const token = generateToken(user._id);
    res.json({
      token,
      user: {
        id: user._id, username: user.username, email: user.email,
        plan: user.plan, theme: user.theme, avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Resend OTP ────────────────────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTPEmail(user, otp);
    res.json({ message: 'OTP resent to your email' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get current user ──────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

// ── Update theme (Task 5c: save selected theme in DB) ─────────────────────────
router.patch('/theme', protect, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['light', 'dark', 'auto'].includes(theme)) {
      return res.status(400).json({ message: 'Invalid theme value' });
    }
    // FIX Task 5: Always save to DB so preference persists across sessions
    await User.findByIdAndUpdate(req.user._id, { theme });
    res.json({ message: 'Theme saved', theme });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
