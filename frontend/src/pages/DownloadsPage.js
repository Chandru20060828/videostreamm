import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const DownloadsPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchDownloads();
  }, [user]);

  const fetchDownloads = async () => {
    try {
      const res = await api.get('/user/downloads');
      setData(res.data);
    } catch {
      toast.error('Failed to load downloads');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return (
    <div className="container" style={{ padding: '60px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <p style={{ marginBottom: 16 }}>Please login to view your downloads.</p>
      <Link to="/login" className="btn btn-primary">Login</Link>
    </div>
  );

  const planLimits = { free: 1, bronze: 5, silver: 15, gold: 'Unlimited' };
  const planColors = { free: '#6b7280', bronze: '#d97706', silver: '#9ca3af', gold: '#f59e0b' };

  const formatDate = (date) =>
    new Date(date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="container" style={{ padding: '32px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>⬇️ My Downloads</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Your video download history and daily limits
      </p>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div className="card" style={{ textAlign: 'center', borderTop: `3px solid ${planColors[user.plan]}` }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Current Plan</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: planColors[user.plan] }}>
            {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Daily Limit</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{planLimits[user.plan]}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Remaining Today</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: data?.remaining > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {data ? data.remaining : '—'}
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Total Downloads</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{data ? data.downloadHistory.length : '—'}</div>
        </div>
      </div>

      {/* Upgrade alert */}
      {data && !data.canDownload && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          ❌ You've reached your daily download limit ({planLimits[user.plan]} for {user.plan} plan).{' '}
          <Link to="/subscription" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Upgrade your plan →</Link>
        </div>
      )}

      {/* Upgrade nudge for free users */}
      {user.plan === 'free' && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          💡 Free plan allows only 1 download per day.{' '}
          <Link to="/subscription" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Upgrade to Bronze for 5/day →</Link>
        </div>
      )}

      {/* Download history */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : !data?.downloadHistory?.length ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⬇️</div>
          <h3 style={{ marginBottom: 8 }}>No downloads yet</h3>
          <p style={{ fontSize: 14, marginBottom: 20 }}>Go to any video and click "Download" to save it here.</p>
          <Link to="/" className="btn btn-primary">Browse Videos</Link>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15 }}>Download History ({data.downloadHistory.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.downloadHistory.map((d, i) => (
              <div
                key={i}
                className="card"
                style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '14px 16px' }}
              >
                {/* Thumbnail or icon */}
                <div style={{
                  width: 80, height: 52, borderRadius: 8, overflow: 'hidden',
                  background: 'var(--bg-hover)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {d.thumbnailUrl ? (
                    <img src={d.thumbnailUrl} alt={d.videoTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 26 }}>🎬</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.videoTitle || 'Untitled Video'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📅 {formatDate(d.downloadDate)}</span>
                    {d.videoId && (
                      <Link
                        to={`/video/${d.videoId}`}
                        style={{ color: 'var(--accent-light)', fontSize: 12 }}
                        onClick={e => e.stopPropagation()}
                      >
                        View Video →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Download button */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {d.cloudinaryUrl ? (
                    <a
                      href={d.cloudinaryUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary btn-sm"
                      title={`Download ${d.videoTitle}`}
                    >
                      ⬇️ Download
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 12px' }}>
                      Unavailable
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadsPage;
