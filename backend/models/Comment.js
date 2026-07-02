const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  
  text: { type: String, required: true },
  originalText: String,
  language: { type: String, default: 'en' },
  detectedLanguage: String,
  
  // Reactions
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Reporting
  reports: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    reportedAt: { type: Date, default: Date.now }
  }],
  isFlagged: { type: Boolean, default: false },
  isHidden: { type: Boolean, default: false },
  
  // Location (optional display)
  city: String,
  region: String,
  showLocation: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);
