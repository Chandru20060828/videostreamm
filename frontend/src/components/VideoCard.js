import React from 'react';
import { Link } from 'react-router-dom';

const VideoCard = ({ video }) => {
  const planRank = { free: 0, bronze: 1, silver: 2, gold: 3 };
  const planColors = { free: '#6b7280', bronze: '#d97706', silver: '#9ca3af', gold: '#f59e0b' };

  const formatDuration = (s) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatViews = (n) => {
    if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n/1000).toFixed(1)}K`;
    return n;
  };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  };

  return (
    <Link to={`/video/${video._id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="card" style={{ padding: 0, transition: 'transform 0.2s', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
      >
        <div className="video-thumbnail">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt={video.title} loading="lazy" />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🎬</div>
          )}
          <div className="thumbnail-overlay">
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '50%', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶</div>
          </div>
          {video.duration > 0 && (
            <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>
              {formatDuration(video.duration)}
            </span>
          )}
          {video.requiredPlan !== 'free' && (
            <span style={{ position: 'absolute', top: 8, left: 8, background: planColors[video.requiredPlan], color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              {video.requiredPlan.toUpperCase()}
            </span>
          )}
          {!video.hasAccess && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔒</div>
          )}
        </div>
        <div style={{ padding: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{video.uploaderName || video.uploader?.username}</span>
            <span>{formatViews(video.views)} views · {timeAgo(video.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default VideoCard;
