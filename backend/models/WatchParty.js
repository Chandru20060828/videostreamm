const mongoose = require('mongoose');

const watchPartySchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostName: String,
  
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  }],
  
  messages: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Playback state
  currentTime: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  
  isActive: { type: Boolean, default: true },
  maxParticipants: { type: Number, default: 10 },
  
  // Recording
  recordingUrl: String,
  isRecording: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  endedAt: Date
});

module.exports = mongoose.model('WatchParty', watchPartySchema);
