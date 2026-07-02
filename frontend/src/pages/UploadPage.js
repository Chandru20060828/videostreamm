import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const CATEGORIES = ['General', 'Education', 'Entertainment', 'Music', 'Gaming', 'Sports', 'Tech', 'News', 'Comedy', 'Travel'];

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB (Cloudinary free tier max)
const MAX_SIZE_MB = 2048;

const UploadPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const videoInputRef = useRef();
  const thumbInputRef = useRef();

  const [form, setForm] = useState({
    title: '', description: '', category: 'General',
    isPremium: false, requiredPlan: 'free', tags: ''
  });
  const [videoFile, setVideoFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState(''); // 'uploading' | 'processing'
  const [dragOver, setDragOver] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleVideoSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a valid video file (MP4, MOV, MKV, AVI, WebM)');
      return;
    }
    // FIX Task 4: Allow up to 2GB
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`File too large. Maximum size is ${MAX_SIZE_MB}MB (2GB).`);
      return;
    }
    setVideoFile(file);
    if (!form.title) {
      setForm(f => ({ ...f, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ') }));
    }
  };

  const handleThumbSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file for the thumbnail');
      return;
    }
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) handleVideoSelect(file);
    else if (file?.type.startsWith('image/')) handleThumbSelect(file);
    else toast.error('Please drop a video file');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!videoFile) { toast.error('Please select a video file'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }

    setUploading(true);
    setProgress(0);
    setUploadPhase('uploading');

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());
      formData.append('category', form.category);
      formData.append('isPremium', form.isPremium);
      formData.append('requiredPlan', form.requiredPlan);
      formData.append('tags', form.tags);

      // FIX Task 4: Increase axios timeout to 30 minutes for large video uploads
      const res = await api.post('/videos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30 * 60 * 1000,    // 30 minutes
        onUploadProgress: (progressEvent) => {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(pct);
          if (pct === 100) {
            setUploadPhase('processing');
          }
        }
      });

      const videoId = res.data.video._id;

      // Upload thumbnail if provided
      if (thumbFile) {
        setUploadPhase('thumbnail');
        const td = new FormData();
        td.append('thumbnail', thumbFile);
        await api.post(`/videos/${videoId}/thumbnail`, td, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000
        });
      }

      toast.success('🎉 Video uploaded successfully!');
      navigate(`/video/${videoId}`);
    } catch (err) {
      console.error('Upload error:', err);
      let msg = 'Upload failed. Please try again.';
      if (err.code === 'ECONNABORTED') {
        msg = 'Upload timed out. For large videos, ensure a stable internet connection and try again.';
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      toast.error(msg);
      setProgress(0);
      setUploadPhase('');
    } finally {
      setUploading(false);
    }
  };

  const phaseMessages = {
    uploading: `Uploading to Cloudinary... ${progress}%`,
    processing: 'Processing video on Cloudinary (this may take a moment for large files)...',
    thumbnail: 'Saving thumbnail...'
  };

  return (
    <div className="container" style={{ padding: '32px 16px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>📤 Upload Video</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Videos are stored on Cloudinary. Supports MP4, MOV, MKV, AVI, WebM up to 2GB.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Video drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !videoFile && !uploading && videoInputRef.current.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : videoFile ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: 40,
            textAlign: 'center',
            cursor: videoFile || uploading ? 'default' : 'pointer',
            background: dragOver ? 'rgba(124,58,237,0.05)' : 'var(--bg-card)',
            marginBottom: 20,
            transition: 'all 0.2s'
          }}
        >
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={e => handleVideoSelect(e.target.files[0])}
            disabled={uploading}
          />
          {videoFile ? (
            <div>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{videoFile.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Size: {formatSize(videoFile.size)}
                {videoFile.size > 100 * 1024 * 1024 && (
                  <span style={{ color: 'var(--warning)', marginLeft: 8 }}>
                    ⚠ Large file — upload may take several minutes
                  </span>
                )}
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setVideoFile(null); setProgress(0); }}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 10 }}
                >
                  Change File
                </button>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🎬</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop your video here or click to browse</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                MP4, MOV, MKV, AVI, WebM · Up to 2GB
              </div>
            </div>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span>{phaseMessages[uploadPhase] || 'Uploading...'}</span>
              {uploadPhase === 'uploading' && <span style={{ fontWeight: 600 }}>{progress}%</span>}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: uploadPhase === 'processing' ? '100%' : `${progress}%`,
                  background: uploadPhase === 'processing' ? 'var(--warning)' : 'var(--accent)',
                  transition: uploadPhase === 'processing' ? 'none' : 'width 0.3s ease'
                }}
              />
            </div>
            {uploadPhase === 'processing' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                ⏳ Cloudinary is processing your video. Do not close this tab.
              </div>
            )}
          </div>
        )}

        {/* Form fields */}
        <div className="form-grid-2">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Title *</label>
            <input
              className="form-control"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Give your video a descriptive title"
              required maxLength={100}
              disabled={uploading}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea
              className="form-control"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe your video..."
              rows={3}
              style={{ resize: 'vertical' }}
              maxLength={2000}
              disabled={uploading}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.description.length}/2000</span>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              className="form-control"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              disabled={uploading}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Access Level</label>
            <select
              className="form-control"
              value={form.requiredPlan}
              onChange={e => setForm(f => ({ ...f, requiredPlan: e.target.value, isPremium: e.target.value !== 'free' }))}
              disabled={uploading}
            >
              <option value="free">🌍 Free — Everyone can watch</option>
              <option value="bronze">🥉 Bronze+ subscribers</option>
              <option value="silver">🥈 Silver+ subscribers</option>
              <option value="gold">🥇 Gold subscribers only</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Tags (comma-separated)</label>
            <input
              className="form-control"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. tutorial, javascript, react, programming"
              disabled={uploading}
            />
          </div>

          {/* Custom thumbnail */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Custom Thumbnail <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — auto-generated if not set)</span></label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => thumbInputRef.current.click()}
                className="btn btn-secondary btn-sm"
                disabled={uploading}
              >
                🖼 Choose Image
              </button>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleThumbSelect(e.target.files[0])}
              />
              {thumbPreview && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={thumbPreview}
                    alt="Thumbnail preview"
                    style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => { setThumbFile(null); setThumbPreview(''); }}
                    style={{
                      position: 'absolute', top: -8, right: -8,
                      background: 'var(--danger)', color: '#fff',
                      border: 'none', borderRadius: '50%', width: 20, height: 20,
                      cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >✕</button>
                </div>
              )}
              {!thumbPreview && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  JPG, PNG, WebP · Max 10MB
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading || !videoFile}
            style={{ flex: 1 }}
          >
            {uploading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                {phaseMessages[uploadPhase] || 'Uploading...'}
              </span>
            ) : (
              <>📤 Upload Video</>
            )}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(-1)}
            disabled={uploading}
          >
            Cancel
          </button>
        </div>

        {uploading && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
            ⚠️ Do not close or refresh this tab during upload.
          </p>
        )}
      </form>
    </div>
  );
};

export default UploadPage;
