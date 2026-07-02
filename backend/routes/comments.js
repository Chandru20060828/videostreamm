const express = require('express');
const router = express.Router();
const axios = require('axios');
const Comment = require('../models/Comment');
const { protect, optionalAuth } = require('../middleware/auth');

// ── Profanity / Spam filters ──────────────────────────────────────────────────
const BLOCKED_WORDS = [
  'spam', 'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard',
  'idiot', 'stupid', 'fool', 'cunt', 'dick', 'pussy', 'hate',
  'kill', 'die', 'abuse', 'scam', 'porn', 'xxx'
];

const containsAbusiveContent = (text) => {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some(word => {
    // Whole-word match to avoid false positives like "classic" → "ass"
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
};

const isSpam = (text) => {
  if (text.length > 1000) return true;
  // Only special characters (no letters/digits)
  if (/^[^a-zA-Z0-9\u0080-\uFFFF\s]+$/.test(text.trim())) return true;
  // Excessive repetition: same char 10+ times
  if (/(.)\1{9,}/.test(text)) return true;
  // All caps long message
  if (text.length > 30 && text === text.toUpperCase() && /[A-Z]/.test(text)) return true;
  return false;
};

// ── Detect script/language from text ─────────────────────────────────────────
const detectLanguage = (text) => {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';   // Devanagari (Hindi)
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';   // Tamil
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';   // Telugu
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';   // Arabic
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';   // Chinese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japanese
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';   // Russian/Cyrillic
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';   // Korean
  return 'en';
};

// FIX Task 6: Translation moved to backend to avoid CORS issues with MyMemory API
// MyMemory free API: 5000 chars/day no key, 50000/day with email
const translateText = async (text, targetLang, sourceLang = 'auto') => {
  if (!text || !targetLang) return text;
  try {
    const langpair = sourceLang === 'auto' ? `|${targetLang}` : `${sourceLang}|${targetLang}`;

    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: text.substring(0, 500), // MyMemory free limit per request
        langpair,
        de: process.env.BREVO_SENDER_EMAIL || 'translate@videostream.com' // increases daily limit
      },
      timeout: 8000
    });

    if (response.data?.responseStatus === 200) {
      const translated = response.data.responseData?.translatedText;
      if (translated && translated !== text) return translated;
    }

    // Fallback: try LibreTranslate public instance
    const libreRes = await axios.post('https://libretranslate.com/translate', {
      q: text.substring(0, 500),
      source: sourceLang === 'auto' ? 'auto' : sourceLang,
      target: targetLang,
      format: 'text'
    }, { timeout: 6000 });

    return libreRes.data?.translatedText || text;
  } catch (err) {
    console.error('Translation error:', err.message);
    // Return original if translation fails
    return null;
  }
};

// ── GET: Comments for a video ─────────────────────────────────────────────────
router.get('/:videoId', optionalAuth, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const comments = await Comment.find({ videoId, isHidden: false })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Comment.countDocuments({ videoId, isHidden: false });

    const commentsOut = comments.map(c => {
      const obj = c.toObject();
      obj.likeCount = c.likes.length;
      obj.dislikeCount = c.dislikes.length;
      obj.userLiked = req.user ? c.likes.some(id => id.toString() === req.user._id.toString()) : false;
      obj.userDisliked = req.user ? c.dislikes.some(id => id.toString() === req.user._id.toString()) : false;
      obj.userReported = req.user ? c.reports.some(r => r.userId?.toString() === req.user._id.toString()) : false;
      // FIX: respect the per-comment privacy flag. Only expose city/region
      // when the commenter opted in (showLocation === true); otherwise strip
      // it so the frontend has nothing to render.
      if (!obj.showLocation) {
        obj.city = undefined;
        obj.region = undefined;
      }
      return obj;
    });

    res.json({ comments: commentsOut, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST: Create comment ──────────────────────────────────────────────────────
router.post('/:videoId', protect, async (req, res) => {
  try {
    const { text, city, region } = req.body;
    const { videoId } = req.params;

    if (!text?.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });
    if (text.trim().length > 1000) return res.status(400).json({ message: 'Comment too long (max 1000 characters)' });

    if (containsAbusiveContent(text)) {
      return res.status(400).json({ message: 'Your comment contains inappropriate language. Please keep it respectful.' });
    }
    if (isSpam(text)) {
      return res.status(400).json({ message: 'Your comment looks like spam. Please write a meaningful message.' });
    }

    // Duplicate check: same text from same user on same video in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const duplicate = await Comment.findOne({
      userId: req.user._id,
      videoId,
      text: text.trim(),
      createdAt: { $gte: oneHourAgo }
    });
    if (duplicate) {
      return res.status(400).json({ message: 'You already posted this comment recently.' });
    }

    const detectedLang = detectLanguage(text);

    // Location attached to the comment: prefer the live location sent from
    // the browser (captured via geolocation at post time). If that wasn't
    // provided (e.g. permission denied), fall back to the user's saved
    // profile location, and finally to Tamil Nadu, India as a default.
    // We still store city/region on the comment either way (useful for
    // moderation/analytics), but FIX: whether it's ever shown to other
    // users is governed by the user's showLocation privacy setting, not
    // hardcoded to always-on.
    const commentCity = city || req.user.city || 'Tamil Nadu';
    const commentRegion = region || req.user.region || 'India';

    const comment = await Comment.create({
      videoId,
      userId: req.user._id,
      username: req.user.username,
      text: text.trim(),
      originalText: text.trim(),
      language: req.user.preferredLanguage || 'en',
      detectedLanguage: detectedLang,
      city: commentCity,
      region: commentRegion,
      showLocation: !!req.user.showLocation
    });

    const obj = comment.toObject();
    obj.likeCount = 0;
    obj.dislikeCount = 0;
    obj.userLiked = false;
    obj.userDisliked = false;
    if (!obj.showLocation) {
      obj.city = undefined;
      obj.region = undefined;
    }

    res.status(201).json({ comment: obj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// FIX Task 6: Translate comment via backend (avoids CORS issues with MyMemory from browser)
router.post('/:commentId/translate', protect, async (req, res) => {
  try {
    const { targetLang } = req.body;
    if (!targetLang) return res.status(400).json({ message: 'targetLang is required' });

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const sourceText = comment.originalText || comment.text;
    const sourceLang = comment.detectedLanguage || 'auto';

    // Don't translate if already in target language
    if (sourceLang === targetLang) {
      return res.json({ translatedText: sourceText, targetLang, alreadyInTargetLang: true });
    }

    const translated = await translateText(sourceText, targetLang, sourceLang);

    if (!translated) {
      return res.status(503).json({
        message: 'Translation service temporarily unavailable. Please try again later.',
        translatedText: sourceText
      });
    }

    res.json({
      translatedText: translated,
      targetLang,
      sourceLang,
      originalText: sourceText
    });
  } catch (err) {
    console.error('Translate route error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST: Like or dislike comment ─────────────────────────────────────────────
router.post('/:commentId/like', protect, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['like', 'dislike'].includes(action)) {
      return res.status(400).json({ message: 'action must be like or dislike' });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const userId = req.user._id;

    if (action === 'like') {
      const idx = comment.likes.findIndex(id => id.toString() === userId.toString());
      if (idx > -1) {
        comment.likes.splice(idx, 1); // toggle off
      } else {
        comment.likes.push(userId);
        // Remove dislike if present
        const didx = comment.dislikes.findIndex(id => id.toString() === userId.toString());
        if (didx > -1) comment.dislikes.splice(didx, 1);
      }
    } else {
      const idx = comment.dislikes.findIndex(id => id.toString() === userId.toString());
      if (idx > -1) {
        comment.dislikes.splice(idx, 1);
      } else {
        comment.dislikes.push(userId);
        const lidx = comment.likes.findIndex(id => id.toString() === userId.toString());
        if (lidx > -1) comment.likes.splice(lidx, 1);
      }
    }

    await comment.save();
    res.json({ likes: comment.likes.length, dislikes: comment.dislikes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST: Report comment ──────────────────────────────────────────────────────
router.post('/:commentId/report', protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const alreadyReported = comment.reports.some(
      r => r.userId?.toString() === req.user._id.toString()
    );
    if (alreadyReported) return res.status(400).json({ message: 'You already reported this comment' });

    comment.reports.push({
      userId: req.user._id,
      reason: reason || 'Inappropriate content'
    });

    // Auto-flag after 3 reports (kept for admin review, not auto-deleted)
    if (comment.reports.length >= 3) comment.isFlagged = true;

    await comment.save();
    res.json({ message: 'Comment reported and flagged for review. Thank you!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
