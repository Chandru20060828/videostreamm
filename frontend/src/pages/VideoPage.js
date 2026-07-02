import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import CommentsSection from '../components/CommentsSection';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const VideoPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [creatingParty, setCreatingParty] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);

  useEffect(() => {
    fetchVideo();
    fetchRelated();
    if (user) fetchDownloadInfo();
  }, [id, user]);

  const fetchVideo = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/videos/${id}`);
      setVideo(res.data.video);
      setLikeCount(res.data.video.likes?.length || 0);
      setLiked(user && res.data.video.likes?.includes(user.id));
    } catch (err) {
      toast.error('Video not found');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelated = async () => {
    try {
      const res = await api.get('/videos?limit=6');
      setRelatedVideos(res.data.videos.filter(v => v._id !== id).slice(0, 5));
    } catch {}
  };

  const fetchDownloadInfo = async () => {
    try {
      const res = await api.get('/subscription/my-plan');
      setDownloadInfo(res.data);
    } catch {}
  };

  const handleLike = async () => {
    if (!user) { toast.info('Login to like videos'); return; }
    try {
      const res = await api.post(`/videos/${id}/like`);
      setLikeCount(res.data.likes);
      setLiked(res.data.liked);
    } catch {}
  };

  const handleDownload = async () => {
    if (!user) { toast.info('Login to download videos'); return; }
    setDownloading(true);
    try {
      const res = await api.post(`/videos/${id}/download`);
      // Trigger download
      const a = document.createElement('a');
      a.href = res.data.downloadUrl;
      a.download = res.data.filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Downloaded! ${res.data.remaining} downloads remaining today.`);
      fetchDownloadInfo();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateParty = async () => {
    if (!user) { toast.info('Login to create a watch party'); return; }
    setCreatingParty(true);
    try {
      const res = await api.post('/watchparty/create', { videoId: id });
      toast.success('Watch party created! Invite your friends.');
      navigate(`/watch-party/${res.data.roomId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create party');
    } finally {
      setCreatingParty(false);
    }
  };

  const formatDuration = (s) => {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!video) return null;

  const planRank = { free: 0, bronze: 1, silver: 2, gold: 3 };
  const userPlanRank = planRank[user?.plan || 'free'];
  const requiredRank = planRank[video.requiredPlan || 'free'];
  const hasAccess = userPlanRank >= requiredRank;

  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="video-page-grid">
        {/* Main content */}
        <div style={{ minWidth: 0 }}>
          {/* Video Player */}
          {hasAccess ? (
            <VideoPlayer
              src={video.cloudinaryUrl}
              poster={video.thumbnailUrl}
              nextVideo={relatedVideos[0]}
              onEnded={() => relatedVideos[0] && navigate(`/video/${relatedVideos[0]._id}`)}
            />
          ) : (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: 60, textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h3 style={{ marginBottom: 8 }}>Premium Content</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This video requires a <strong>{video.requiredPlan}</strong> plan or higher.
              </p>
              <Link to="/subscription" className="btn btn-primary">⭐ Upgrade Plan</Link>
            </div>
          )}

          {/* Video Info */}
          <div style={{ marginTop: 16 }}>
            <h1 style={{ fontSize: 'clamp(16px, 3vw, 22px)', fontWeight: 700, marginBottom: 8 }}>{video.title}</h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                👁 {video.views?.toLocaleString()} views · {timeAgo(video.createdAt)}
              </span>
              {video.duration > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>⏱ {formatDuration(video.duration)}</span>
              )}
              {video.category && (
                <span style={{ background: 'var(--bg-hover)', padding: '2px 10px', borderRadius: 100, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {video.category}
                </span>
              )}
              {video.requiredPlan !== 'free' && (
                <span className={`badge badge-${video.requiredPlan}`}>{video.requiredPlan.toUpperCase()}</span>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={handleLike}
                className={`btn btn-sm ${liked ? 'btn-primary' : 'btn-secondary'}`}
              >
                {liked ? '👍' : '👍'} {likeCount}
              </button>

              <button
                onClick={handleDownload}
                className="btn btn-secondary btn-sm"
                disabled={downloading || !hasAccess}
                title={!hasAccess ? 'Upgrade plan to download' : downloadInfo ? `${downloadInfo.downloadsRemaining} downloads left today` : ''}
              >
                {downloading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '⬇️'} Download
                {downloadInfo && hasAccess && (
                  <span style={{ fontSize: 10, opacity: 0.7 }}>({downloadInfo.downloadsRemaining} left)</span>
                )}
              </button>

              <button
                onClick={handleCreateParty}
                className="btn btn-secondary btn-sm"
                disabled={creatingParty}
              >
                {creatingParty ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🎉'} Watch Party
              </button>

              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }}
                className="btn btn-secondary btn-sm"
              >
                🔗 Share
              </button>
            </div>

            {/* Uploader info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="avatar" style={{ width: 40, height: 40 }}>
                {video.uploader?.avatar
                  ? <img src={video.uploader.avatar} alt={video.uploaderName} />
                  : (video.uploaderName || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{video.uploaderName || video.uploader?.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Creator</div>
              </div>
            </div>

            {/* Description */}
            {video.description && (
              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {video.description}
              </div>
            )}

            {/* Tags */}
            {video.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {video.tags.map(tag => (
                  <span key={tag} style={{ background: 'var(--bg-hover)', color: 'var(--accent-light)', padding: '3px 10px', borderRadius: 100, fontSize: 12 }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Download limit info */}
            {user && downloadInfo && (
              <div className={`alert ${downloadInfo.canDownload ? 'alert-info' : 'alert-error'}`} style={{ fontSize: 13 }}>
                {downloadInfo.canDownload
                  ? `📥 ${downloadInfo.downloadsRemaining} download${downloadInfo.downloadsRemaining !== 1 ? 's' : ''} remaining today (${user.plan} plan)`
                  : `❌ Daily download limit reached. Upgrade to download more. `}
                {!downloadInfo.canDownload && <Link to="/subscription" style={{ color: 'var(--accent-light)' }}>Upgrade now</Link>}
              </div>
            )}

            {/* Comments */}
            <CommentsSection videoId={id} />
          </div>
        </div>

        {/* Sidebar - Related Videos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Up Next</h3>
          {relatedVideos.map(rv => (
            <Link key={rv._id} to={`/video/${rv._id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', gap: 10, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                overflow: 'hidden', border: '1px solid var(--border)', transition: 'border-color 0.2s'
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ width: 120, flexShrink: 0, position: 'relative', background: 'var(--bg-hover)' }}>
                  {rv.thumbnailUrl
                    ? <img src={rv.thumbnailUrl} alt={rv.title} style={{ width: '100%', height: 68, objectFit: 'cover' }} />
                    : <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎬</div>}
                  {!rv.hasAccess && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔒</div>
                  )}
                </div>
                <div style={{ padding: '8px 8px 8px 0', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: 'var(--text-primary)' }}>
                    {rv.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rv.uploaderName}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
};

export default VideoPage;
