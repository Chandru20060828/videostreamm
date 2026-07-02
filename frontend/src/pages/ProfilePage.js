import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const ProfilePage = () => {
  const { user, updateUser, updateTheme, theme, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const avatarRef = useRef();

  const [activeTab, setActiveTab] = useState('videos');
  const [myVideos, setMyVideos] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ preferredLanguage: 'en', showLocation: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    setSettings({ preferredLanguage: user.preferredLanguage || 'en', showLocation: user.showLocation || false });
    if (activeTab === 'videos') fetchMyVideos();
    else if (activeTab === 'downloads') fetchDownloads();
  }, [user, activeTab]);

  const fetchMyVideos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/videos/user/my-videos');
      setMyVideos(res.data.videos);
    } catch {}
    finally { setLoading(false); }
  };

  const fetchDownloads = async () => {
    setLoading(true);
    try {
      const res = await api.get('/user/downloads');
      setDownloads(res.data.downloadHistory);
      setDownloadInfo(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await api.post('/user/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser({ avatar: res.data.avatar });
      toast.success('Avatar updated!');
    } catch {
      toast.error('Failed to update avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await api.patch('/user/profile', settings);
      updateUser(settings);
      toast.success('Settings saved!');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Delete this video?')) return;
    try {
      await api.delete(`/videos/${videoId}`);
      setMyVideos(prev => prev.filter(v => v._id !== videoId));
      toast.success('Video deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  if (!user) return null;

  const planColors = { free: '#6b7280', bronze: '#d97706', silver: '#9ca3af', gold: '#f59e0b' };
  const planIcons = { free: '🎬', bronze: '🥉', silver: '🥈', gold: '🥇' };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="container" style={{ padding: '24px 16px' }}>
      {/* Profile header */}
      <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <div
            className="avatar"
            style={{ width: 80, height: 80, fontSize: 28, cursor: 'pointer' }}
            onClick={() => avatarRef.current.click()}
            title="Click to change avatar"
          >
            {uploadingAvatar ? <span className="spinner" /> :
              user.avatar ? <img src={user.avatar} alt={user.username} /> : user.username[0].toUpperCase()}
          </div>
          <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}
            onClick={() => avatarRef.current.click()}>✏️</div>
          <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatarUpload(e.target.files[0])} />
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{user.username}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8 }}>{user.email}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              background: planColors[user.plan],
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 100,
              fontSize: 12,
              fontWeight: 700
            }}>
              {planIcons[user.plan]} {user.plan.toUpperCase()} PLAN
            </span>
            {downloadInfo && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                📥 {downloadInfo.remaining} downloads left today
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/subscription" className="btn btn-primary btn-sm">⭐ Upgrade</Link>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn btn-secondary btn-sm">🚪 Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {['videos', 'downloads', 'settings'].map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'videos' ? '🎬 My Videos' : tab === 'downloads' ? '⬇️ Downloads' : '⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* My Videos Tab */}
      {activeTab === 'videos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15 }}>My Uploaded Videos ({myVideos.length})</h3>
            <Link to="/upload" className="btn btn-primary btn-sm">+ Upload New</Link>
          </div>
          {loading ? <div className="loading-center"><div className="spinner" /></div>
            : myVideos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
                <p>You haven't uploaded any videos yet.</p>
                <Link to="/upload" className="btn btn-primary" style={{ marginTop: 12 }}>Upload Your First Video</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myVideos.map(v => (
                  <div key={v._id} className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 120, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                      {v.thumbnailUrl
                        ? <img src={v.thumbnailUrl} alt={v.title} style={{ width: '100%', height: 68, objectFit: 'cover' }} />
                        : <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎬</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        👁 {v.views || 0} views · 👍 {v.likes?.length || 0} likes · {timeAgo(v.createdAt)}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 100, color: 'var(--text-secondary)' }}>
                          {v.category}
                        </span>
                        {v.requiredPlan !== 'free' && (
                          <span className={`badge badge-${v.requiredPlan}`} style={{ fontSize: 10 }}>{v.requiredPlan}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/video/${v._id}`} className="btn btn-secondary btn-sm">View</Link>
                      <button onClick={() => handleDeleteVideo(v._id)} className="btn btn-danger btn-sm">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Downloads Tab */}
      {activeTab === 'downloads' && (
        <div>
          {downloadInfo && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              Plan: <strong>{user.plan.toUpperCase()}</strong> · Downloads today: <strong>{downloadInfo.remaining} remaining</strong>
            </div>
          )}
          {loading ? <div className="loading-center"><div className="spinner" /></div>
            : downloads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⬇️</div>
                <p>No downloads yet. Go download some videos!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {downloads.map((d, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{d.videoTitle}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {new Date(d.downloadDate).toLocaleString('en-IN')}</div>
                    </div>
                    <a href={d.cloudinaryUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                      ↓ Download Again
                    </a>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: 500 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 16 }}>🎨 Theme</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['dark', 'light', 'auto'].map(t => (
                <button
                  key={t}
                  onClick={() => updateTheme(t)}
                  className={`btn btn-sm ${(user?.theme || 'auto') === t ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀️ Light' : '🕐 Auto (time-based)'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              💡 <strong>Auto Theme Logic:</strong><br />
              Login between <strong>10:00 AM – 12:00 PM IST</strong> → Light theme applied automatically<br />
              All other times → Dark theme applied<br />
              Your selection here overrides the auto logic and is saved to your account.
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 16 }}>🌐 Language & Privacy</h4>
            <div className="form-group">
              <label>Preferred Language</label>
              <select
                className="form-control"
                value={settings.preferredLanguage}
                onChange={e => setSettings(s => ({ ...s, preferredLanguage: e.target.value }))}
              >
                {[
                  ['en', 'English'], ['hi', 'Hindi'], ['ta', 'Tamil'], ['te', 'Telugu'],
                  ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['ar', 'Arabic'], ['zh', 'Chinese']
                ].map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.showLocation}
                  onChange={e => setSettings(s => ({ ...s, showLocation: e.target.checked }))}
                />
                Show my location on comments (optional)
              </label>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your exact city will not be shown publicly when this is off.</span>
            </div>
            <button onClick={handleSaveSettings} className="btn btn-primary" disabled={savingSettings}>
              {savingSettings ? <span className="spinner" /> : '💾 Save Settings'}
            </button>
          </div>

          <div className="card">
            <h4 style={{ marginBottom: 14 }}>🔐 Security Features</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '🔒', label: 'New Device Detection', desc: 'OTP sent to email when logging in from a new browser/device' },
                { icon: '📍', label: 'Location Detection', desc: 'OTP sent when logging in from a new city or state' },
                { icon: '🎨', label: 'Smart Theme', desc: 'Light theme auto-applied between 10:00 AM – 12:00 PM IST on login' },
                { icon: '🛡️', label: 'Password Security', desc: 'Passwords encrypted with bcrypt (12 salt rounds)' },
                { icon: '🔑', label: 'Session Security', desc: 'JWT tokens expire after 7 days automatically' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
