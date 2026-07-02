const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// FIX Task 4: Use memoryStorage for video and upload directly via Cloudinary stream
// This avoids multer body-parser size limits killing large file uploads.
// Also set chunk_size for resumable uploads on Cloudinary side.
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'videoplatform/videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'm4v'],
    // chunk_size enables resumable upload — critical for files > 100MB
    chunk_size: 6000000,      // 6MB chunks
    quality: 'auto',
    timeout: 120000,          // 2 minutes per chunk
  })
});

const thumbnailStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'videoplatform/thumbnails',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 640, height: 360, crop: 'fill', quality: 'auto' }]
  }
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'videoplatform/avatars',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 200, height: 200, crop: 'fill', quality: 'auto' }]
  }
});

// FIX: 2GB limit for large videos (Cloudinary free tier supports up to 2GB)
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }  // 2GB
});

const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 10 * 1024 * 1024 }   // 10MB
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }    // 5MB
});

module.exports = { cloudinary, uploadVideo, uploadThumbnail, uploadAvatar };
