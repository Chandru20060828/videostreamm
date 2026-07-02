const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { uploadAvatar } = require('../utils/cloudinary');

// Get profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -otpCode -otpExpiry -knownDevices');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile
router.patch('/profile', protect, async (req, res) => {
  try {
    const { preferredLanguage, showLocation, theme } = req.body;
    const updates = {};
    if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
    if (showLocation !== undefined) updates.showLocation = showLocation;
    if (theme) updates.theme = theme;
    
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload avatar
router.post('/profile/avatar', protect, (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const user = await User.findByIdAndUpdate(req.user._id, { avatar: req.file.path }, { new: true }).select('-password');
    res.json({ avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get download history
router.get('/downloads', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('downloadHistory dailyDownloadCount lastDownloadDate plan');
    const { allowed, remaining } = user.canDownload();
    res.json({ 
      downloadHistory: user.downloadHistory,
      plan: user.plan,
      canDownload: allowed,
      remaining
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
