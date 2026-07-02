const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const WatchParty = require('../models/WatchParty');
const Video = require('../models/Video');
const { protect } = require('../middleware/auth');

// Create watch party
router.post('/create', protect, async (req, res) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ message: 'videoId is required' });

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const roomId = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

    const party = await WatchParty.create({
      roomId,
      videoId: video._id,
      host: req.user._id,
      hostName: req.user.username,
      participants: [{ userId: req.user._id, username: req.user.username }]
    });

    res.status(201).json({
      party,
      roomId,
      inviteLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/watch-party/${roomId}`
    });
  } catch (err) {
    console.error('Create party error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get party info (with video populated)
router.get('/:roomId', protect, async (req, res) => {
  try {
    const party = await WatchParty.findOne({ roomId: req.params.roomId, isActive: true })
      .populate('videoId', 'title cloudinaryUrl thumbnailUrl duration uploaderName');

    if (!party) return res.status(404).json({ message: 'Watch party not found or has ended' });

    res.json({ party });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Join party
router.post('/:roomId/join', protect, async (req, res) => {
  try {
    const party = await WatchParty.findOne({ roomId: req.params.roomId, isActive: true });
    if (!party) return res.status(404).json({ message: 'Watch party not found or has ended' });

    if (party.participants.length >= party.maxParticipants) {
      return res.status(400).json({ message: 'Watch party is full (max 10 participants)' });
    }

    // Add user if not already a participant
    const alreadyIn = party.participants.find(
      p => p.userId?.toString() === req.user._id.toString()
    );
    if (!alreadyIn) {
      party.participants.push({ userId: req.user._id, username: req.user.username });
      await party.save();
    }

    // FIX: Fetch video separately to always get fresh data
    const video = await Video.findById(party.videoId).select('title cloudinaryUrl thumbnailUrl duration uploaderName');

    if (!video) return res.status(404).json({ message: 'The video for this party is no longer available' });

    res.json({ party, video });
  } catch (err) {
    console.error('Join party error:', err);
    res.status(500).json({ message: err.message });
  }
});

// End party (host only)
router.post('/:roomId/end', protect, async (req, res) => {
  try {
    const party = await WatchParty.findOne({ roomId: req.params.roomId });
    if (!party) return res.status(404).json({ message: 'Party not found' });

    if (party.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can end the watch party' });
    }

    party.isActive = false;
    party.endedAt = new Date();
    await party.save();

    res.json({ message: 'Watch party ended successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user's parties
router.get('/user/my-parties', protect, async (req, res) => {
  try {
    const parties = await WatchParty.find({
      $or: [
        { host: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    })
      .populate('videoId', 'title thumbnailUrl cloudinaryUrl')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ parties });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
