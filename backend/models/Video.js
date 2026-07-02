const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  cloudinaryUrl: { type: String, required: true },
  cloudinaryPublicId: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  thumbnailPublicId: String,
  duration: { type: Number, default: 0 },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploaderName: String,
  
  // Access control
  isPremium: { type: Boolean, default: false },
  requiredPlan: { type: String, enum: ['free', 'bronze', 'silver', 'gold'], default: 'free' },
  
  // Stats
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Tags/Categories
  tags: [String],
  category: { type: String, default: 'General' },
  language: { type: String, default: 'en' },
  
  size: Number,
  format: String,
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', videoSchema);
