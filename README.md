# 🎬 VideoStream Platform

A full-stack video streaming platform with all 6 internship features implemented.

## Features

1. **🎉 Watch Party** — Real-time video watch party with WebRTC video calls, screen sharing, and chat (Socket.IO)
2. **⬇️ Controlled Downloads** — Plan-based download limits (Free: 1/day, Bronze: 5/day, Silver: 15/day, Gold: unlimited)
3. **⭐ Subscription Plans** — Free / Bronze / Silver / Gold plans with Razorpay test payment + Brevo invoice emails
4. **🎮 Custom Video Player** — Full controls, seek ±10s, gesture double-tap, loading state, next video
5. **🎨 Smart Theme + Security** — Auto light theme 10AM–12PM IST, OTP verification on new device/location
6. **💬 Advanced Comments** — Multi-language support, translation (MyMemory API), profanity filtering, like/dislike/report

## Tech Stack

**Backend:** Node.js, Express, MongoDB (Mongoose), Socket.IO, Cloudinary, Razorpay, Brevo (email), JWT, WebRTC signaling, GeoIP

**Frontend:** React 18, React Router v6, Socket.IO Client, Axios, WebRTC

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account (free tier works)
- Brevo account (free tier: 300 emails/day)
- Razorpay test account

---

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values (see below)
npm start
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Set REACT_APP_API_URL and REACT_APP_SOCKET_URL
npm start
```

---

## Environment Variables

### Backend `.env`

```env
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/videoplatform

JWT_SECRET=your_random_secret_key_here
JWT_EXPIRES_IN=7d

# Cloudinary (cloudinary.com → Dashboard)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Brevo (brevo.com → SMTP & API → API Keys)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=VideoStream

# Razorpay (razorpay.com → Settings → API Keys → Test Mode)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your_secret

FRONTEND_URL=http://localhost:3000
```

### Frontend `.env`

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

---

## Getting API Keys

### Cloudinary
1. Go to [cloudinary.com](https://cloudinary.com) → Sign up free
2. Dashboard → Copy Cloud Name, API Key, API Secret

### Brevo (Email)
1. Go to [brevo.com](https://brevo.com) → Sign up free
2. Settings → SMTP & API → API Keys → Create API Key
3. Use your verified sender email

### Razorpay (Test Mode)
1. Go to [razorpay.com](https://razorpay.com) → Create account
2. Settings → API Keys → Generate Test Key
3. Copy Key ID and Key Secret
4. Use test card: `4111 1111 1111 1111`, any future date, any CVV

### MongoDB Atlas
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Free cluster
2. Create database user → Get connection string
3. Replace `<password>` in connection string

---

## API Endpoints

### Auth
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login (returns OTP flow if new device)
- `POST /api/auth/verify-otp` — Verify OTP for new device
- `GET /api/auth/me` — Get current user
- `PATCH /api/auth/theme` — Update theme

### Videos
- `GET /api/videos` — List videos (with access control)
- `GET /api/videos/:id` — Get video + increment views
- `POST /api/videos/upload` — Upload video (multipart)
- `POST /api/videos/:id/thumbnail` — Upload thumbnail
- `POST /api/videos/:id/download` — Download (tracked, plan-limited)
- `POST /api/videos/:id/like` — Like/unlike
- `GET /api/videos/user/my-videos` — My uploaded videos
- `DELETE /api/videos/:id` — Delete own video

### Comments
- `GET /api/comments/:videoId` — Get comments
- `POST /api/comments/:videoId` — Post comment (moderated)
- `POST /api/comments/:commentId/translate` — Translate comment
- `POST /api/comments/:commentId/like` — Like/dislike
- `POST /api/comments/:commentId/report` — Report

### Subscription
- `GET /api/subscription/plans` — Get plan details + Razorpay key
- `POST /api/subscription/create-order` — Create Razorpay order
- `POST /api/subscription/verify` — Verify payment + upgrade plan + send email
- `GET /api/subscription/my-plan` — Current plan + download info

### Watch Party
- `POST /api/watchparty/create` — Create party (returns roomId)
- `GET /api/watchparty/:roomId` — Get party info
- `POST /api/watchparty/:roomId/join` — Join party
- `POST /api/watchparty/:roomId/end` — End party (host only)
- `GET /api/watchparty/user/my-parties` — My parties

### User
- `GET /api/user/profile` — Get profile
- `PATCH /api/user/profile` — Update preferences
- `POST /api/user/profile/avatar` — Upload avatar
- `GET /api/user/downloads` — Download history

---

## Socket.IO Events

| Event | Description |
|-------|-------------|
| `join-party` | Join a watch party room |
| `video-sync` | Sync video playback state |
| `chat-message` | Send/receive party chat |
| `webrtc-offer/answer/ice-candidate` | WebRTC video call signaling |
| `call-control` | Mute/camera toggle notifications |
| `screen-share-start/stop` | Screen sharing events |
| `user-joined/left` | Participant join/leave |

---

## Plan Download Limits

| Plan | Downloads/Day | Price |
|------|--------------|-------|
| Free | 1 | ₹0 |
| Bronze | 5 | ₹99/month |
| Silver | 15 | ₹199/month |
| Gold | Unlimited | ₹399/month |

---

## Security Features
- JWT authentication with 7-day expiry
- Bcrypt password hashing
- OTP verification via email for new device/location login
- GeoIP-based location detection
- Rate limiting (200 req/15min)
- Comment moderation: profanity filter, spam detection, duplicate detection
- Plan-based video access control
- Download limit enforcement per plan

## Theme Logic
- Login between 10:00 AM – 12:00 PM IST → Light theme automatically applied
- All other times → Dark theme
- Users can manually override in Settings
- Preference saved in database per user
"# videostreamm" 
"# videostreamm" 
"# videostreamm" 
