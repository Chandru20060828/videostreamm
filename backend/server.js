require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/watchparty', require('./routes/watchparty'));
app.use('/api/user', require('./routes/profile'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ===== SOCKET.IO - Watch Party + Video Calls =====
// rooms[roomId] = { participants: { socketId -> {userId, username, socketId} }, videoState }
const rooms = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Join watch party room
  // FIX: track which room this socket joined to avoid double-join on React StrictMode
  socket.on('join-party', ({ roomId, userId, username }) => {
    // If socket is already in this room, skip re-adding
    const alreadyInRoom = socket.rooms.has(roomId);
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { participants: {}, videoState: { currentTime: 0, isPlaying: false } };
    }

    // Only add/update if not already tracked to prevent duplicates
    if (!rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id] = { userId, username, socketId: socket.id };
      // Notify OTHERS (not self) that someone new joined
      socket.to(roomId).emit('user-joined', { userId, username, socketId: socket.id });
    }

    // Send current state to the joining socket
    socket.emit('party-state', {
      participants: Object.values(rooms[roomId].participants),
      videoState: rooms[roomId].videoState
    });

    console.log(`${username} joined room ${roomId}. Total: ${Object.keys(rooms[roomId].participants).length}`);
  });

  // Sync video playback (only broadcast to others, not back to sender)
  socket.on('video-sync', ({ roomId, currentTime, isPlaying, action }) => {
    if (rooms[roomId]) {
      rooms[roomId].videoState = { currentTime, isPlaying };
    }
    // Use socket.to() so the sender does NOT receive their own sync back (prevents loop)
    socket.to(roomId).emit('video-sync', { currentTime, isPlaying, action, by: socket.id });
  });

  // Chat message
  // FIX: Use socket.to() + send back to sender separately to avoid duplication
  // Previously used io.to() which sends to ALL including sender, then client also adds it locally
  socket.on('chat-message', ({ roomId, message, username, userId }) => {
    const msg = { id: `${socket.id}-${Date.now()}`, message, username, userId, timestamp: new Date() };
    // Send to everyone EXCEPT the sender (sender adds it locally)
    socket.to(roomId).emit('chat-message', msg);
    // Confirm back to sender with same msg so they can display it
    socket.emit('chat-message-sent', msg);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc-offer', { offer, fromSocketId: socket.id });
  });

  socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc-answer', { answer, fromSocketId: socket.id });
  });

  socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
  });

  // Call controls
  socket.on('call-control', ({ roomId, action, userId }) => {
    socket.to(roomId).emit('call-control', { action, userId, socketId: socket.id });
  });

  // Screen share
  socket.on('screen-share-start', ({ roomId }) => {
    socket.to(roomId).emit('screen-share-start', { socketId: socket.id });
  });

  socket.on('screen-share-stop', ({ roomId }) => {
    socket.to(roomId).emit('screen-share-stop', { socketId: socket.id });
  });

  // Leave party
  socket.on('leave-party', ({ roomId, username }) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      delete rooms[roomId].participants[socket.id];
      if (Object.keys(rooms[roomId].participants).length === 0) {
        delete rooms[roomId];
      }
    }
    io.to(roomId).emit('user-left', { username, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(roomId => {
      if (rooms[roomId]?.participants[socket.id]) {
        const { username } = rooms[roomId].participants[socket.id];
        delete rooms[roomId].participants[socket.id];
        io.to(roomId).emit('user-left', { username, socketId: socket.id });
        if (Object.keys(rooms[roomId].participants).length === 0) {
          delete rooms[roomId];
        }
      }
    });
    console.log('Socket disconnected:', socket.id);
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.setTimeout(10 * 60 * 1000); // 10 min timeout for large uploads
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = { app, io };
// End of file - timeout patch applied inline above
