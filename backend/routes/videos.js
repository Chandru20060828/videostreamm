const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const User = require('../models/User');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadVideo, uploadThumbnail, cloudinary } = require('../utils/cloudinary');

// Upload video
router.post('/upload', protect, (req, res, next) => {
  uploadVideo.single('video')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ message: 'Upload failed: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No video file provided' });

    const { title, description, isPremium, requiredPlan, tags, category } = req.body;

    // FIX: Cloudinary video resource type gives .path as the secure_url
    // Build auto-generated thumbnail URL from Cloudinary video URL
    const videoUrl = req.file.path;
    const publicId = req.file.filename;

    // Auto thumbnail: replace /video/upload/ with /video/upload/so_auto,w_640,h_360,c_fill/ and change ext to jpg
    const autoThumb = videoUrl
      .replace('/video/upload/', '/video/upload/so_auto,w_640,h_360,c_fill/')
      .replace(/\.(mp4|mov|avi|mkv|webm)$/i, '.jpg');

    const video = await Video.create({
      title: title || req.file.originalname,
      description: description || '',
      cloudinaryUrl: videoUrl,
      cloudinaryPublicId: publicId,
      thumbnailUrl: autoThumb,
      duration: req.file.duration || 0,
      uploader: req.user._id,
      uploaderName: req.user.username,
      isPremium: isPremium === 'true',
      requiredPlan: requiredPlan || 'free',
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      category: category || 'General',
      size: req.file.size,
      format: req.file.mimetype
    });

    res.status(201).json({ message: 'Video uploaded successfully', video });
  } catch (err) {
    console.error('Create video error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Upload thumbnail separately
router.post('/:id/thumbnail', protect, (req, res, next) => {
  uploadThumbnail.single('thumbnail')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    if (video.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    video.thumbnailUrl = req.file.path;
    video.thumbnailPublicId = req.file.filename;
    await video.save();
    res.json({ thumbnailUrl: req.file.path });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all videos (with access control)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;
    const query = {};
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
      { uploaderName: { $regex: search, $options: 'i' } }
    ];
    if (category && category !== 'All') query.category = category;

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('uploader', 'username avatar');

    const total = await Video.countDocuments(query);

    const userPlan = req.user?.plan || 'free';
    const planRank = { free: 0, bronze: 1, silver: 2, gold: 3 };

    const videosWithAccess = videos.map(v => {
      const vid = v.toObject();
      vid.hasAccess = planRank[userPlan] >= planRank[v.requiredPlan || 'free'];
      return vid;
    });

    res.json({ videos: videosWithAccess, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user's own videos (must be before /:id)
router.get('/user/my-videos', protect, async (req, res) => {
  try {
    const videos = await Video.find({ uploader: req.user._id }).sort({ createdAt: -1 });
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single video
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('uploader', 'username avatar');
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const userPlan = req.user?.plan || 'free';
    const planRank = { free: 0, bronze: 1, silver: 2, gold: 3 };
    const hasAccess = planRank[userPlan] >= planRank[video.requiredPlan || 'free'];

    video.views += 1;
    await video.save();

    const vid = video.toObject();
    vid.hasAccess = hasAccess;

    res.json({ video: vid });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// FIX Task 2: Download video — save thumbnailUrl in download history for display
router.post('/:id/download', protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const user = await User.findById(req.user._id);
    const { allowed, remaining } = user.canDownload();

    if (!allowed) {
      const limits = { free: 1, bronze: 5, silver: 15, gold: 'Unlimited' };
      return res.status(403).json({
        message: `Daily download limit reached. ${user.plan} plan allows ${limits[user.plan]} download(s) per day. Upgrade for more.`,
        remaining: 0
      });
    }

    // Update daily count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!user.lastDownloadDate || new Date(user.lastDownloadDate) < today) {
      user.dailyDownloadCount = 1;
    } else {
      user.dailyDownloadCount += 1;
    }
    user.lastDownloadDate = new Date();

    // FIX: Save thumbnailUrl alongside other download info
    user.downloadHistory.unshift({
      videoId: video._id,
      videoTitle: video.title,
      downloadDate: new Date(),
      cloudinaryUrl: video.cloudinaryUrl,
      thumbnailUrl: video.thumbnailUrl || ''  // <-- saved for display in Downloads page
    });

    if (user.downloadHistory.length > 100) {
      user.downloadHistory = user.downloadHistory.slice(0, 100);
    }
    await user.save();

    res.json({
      downloadUrl: video.cloudinaryUrl,
      filename: `${video.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
      remaining: remaining - 1
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Like/unlike video
router.post('/:id/like', protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    const idx = video.likes.indexOf(req.user._id);
    if (idx > -1) video.likes.splice(idx, 1);
    else video.likes.push(req.user._id);
    await video.save();
    res.json({ likes: video.likes.length, liked: idx === -1 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete video
router.delete('/:id', protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Not found' });
    if (video.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await cloudinary.uploader.destroy(video.cloudinaryPublicId, { resource_type: 'video' });
    if (video.thumbnailPublicId) await cloudinary.uploader.destroy(video.thumbnailPublicId);
    await video.deleteOne();
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
