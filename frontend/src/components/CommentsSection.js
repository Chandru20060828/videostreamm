import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const LANGUAGES = [
  { code: 'en', name: '🇬🇧 English' },
  { code: 'hi', name: '🇮🇳 Hindi' },
  { code: 'ta', name: '🇮🇳 Tamil' },
  { code: 'te', name: '🇮🇳 Telugu' },
  { code: 'fr', name: '🇫🇷 French' },
  { code: 'es', name: '🇪🇸 Spanish' },
  { code: 'de', name: '🇩🇪 German' },
  { code: 'ar', name: '🇸🇦 Arabic' },
  { code: 'zh', name: '🇨🇳 Chinese' },
  { code: 'ja', name: '🇯🇵 Japanese' },
  { code: 'ko', name: '🇰🇷 Korean' },
  { code: 'ru', name: '🇷🇺 Russian' },
  { code: 'pt', name: '🇧🇷 Portuguese' },
];

const LANG_NAME_MAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l.name]));

const timeAgo = (date) => {
  const diff = (Date.now() - new Date(date)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
};

// ── Single comment item ────────────────────────────────────────────────────────
const CommentItem = ({ comment, onLike, onDislike, onReport }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [reported, setReported] = useState(comment.userReported);

  // FIX Task 6: Translation now goes through backend /api/comments/:id/translate
  // which calls MyMemory from the server — avoids browser CORS block
  const handleTranslate = async () => {
    if (!targetLang) return;
    setTranslating(true);
    setTranslateError('');
    try {
      const res = await api.post(`/comments/${comment._id}/translate`, { targetLang });
      if (res.data.alreadyInTargetLang) {
        setTranslateError('Comment is already in the selected language.');
        setTranslatedText('');
      } else {
        setTranslatedText(res.data.translatedText);
        setTranslateError('');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Translation failed. Please try again.';
      setTranslateError(msg);
    } finally {
      setTranslating(false);
    }
  };

  const handleReport = async () => {
    if (reported) return;
    try {
      const res = await onReport(comment._id);
      setReported(true);
      toast.info('Comment reported for review');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to report');
    }
  };

  const displayText = translatedText || comment.text;
  const isTranslated = !!translatedText;

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div className="avatar" style={{ width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>
          {comment.username?.[0]?.toUpperCase() || '?'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{comment.username}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(comment.createdAt)}</span>

            {comment.detectedLanguage && comment.detectedLanguage !== 'en' && (
              <span style={{
                fontSize: 10, background: 'var(--bg-hover)',
                padding: '1px 7px', borderRadius: 8, color: 'var(--text-secondary)'
              }}>
                {LANG_NAME_MAP[comment.detectedLanguage] || comment.detectedLanguage}
              </span>
            )}

            {comment.city && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                📍 {comment.city}{comment.region ? `, ${comment.region}` : ''}
              </span>
            )}

            {comment.isFlagged && (
              <span style={{
                fontSize: 10, background: 'rgba(239,68,68,0.15)',
                color: 'var(--danger)', padding: '1px 7px', borderRadius: 8
              }}>
                ⚠ Under Review
              </span>
            )}

            {isTranslated && (
              <span style={{
                fontSize: 10, background: 'rgba(124,58,237,0.15)',
                color: 'var(--accent-light)', padding: '1px 7px', borderRadius: 8
              }}>
                🌐 Translated
              </span>
            )}
          </div>

          {/* Comment text */}
          <p style={{
            fontSize: 14, color: 'var(--text-primary)',
            marginBottom: 8, lineHeight: 1.6, wordBreak: 'break-word'
          }}>
            {displayText}
          </p>

          {isTranslated && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontStyle: 'italic' }}>
              🌐 Translated from {LANG_NAME_MAP[comment.detectedLanguage] || comment.detectedLanguage || 'original language'}
            </p>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {user && (
              <>
                <button
                  onClick={() => onLike(comment._id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: comment.userLiked ? 'var(--accent-light)' : 'var(--text-muted)',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                    padding: 0, fontWeight: comment.userLiked ? 600 : 400
                  }}
                >
                  👍 {comment.likeCount || 0}
                </button>
                <button
                  onClick={() => onDislike(comment._id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: comment.userDisliked ? 'var(--danger)' : 'var(--text-muted)',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                    padding: 0, fontWeight: comment.userDisliked ? 600 : 400
                  }}
                >
                  👎 {comment.dislikeCount || 0}
                </button>
              </>
            )}

            <button
              onClick={() => { setShowTranslate(s => !s); setTranslateError(''); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: showTranslate ? 'var(--accent-light)' : 'var(--text-muted)',
                fontSize: 12, padding: 0
              }}
            >
              🌐 {showTranslate ? 'Hide Translate' : 'Translate'}
            </button>

            {isTranslated && (
              <button
                onClick={() => setTranslatedText('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0 }}
              >
                ↩ Original
              </button>
            )}

            {user && !reported && (
              <button
                onClick={handleReport}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0 }}
              >
                ⚑ Report
              </button>
            )}
            {reported && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Reported</span>
            )}
          </div>

          {/* Translate panel */}
          {showTranslate && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Translate to:
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={targetLang}
                  onChange={e => { setTargetLang(e.target.value); setTranslatedText(''); setTranslateError(''); }}
                  className="form-control"
                  style={{ width: 'auto', fontSize: 13, padding: '5px 10px' }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>

                <button
                  onClick={handleTranslate}
                  className="btn btn-primary btn-sm"
                  disabled={translating}
                  style={{ minWidth: 90 }}
                >
                  {translating ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="spinner" style={{ width: 12, height: 12 }} />
                      Translating
                    </span>
                  ) : '🌐 Translate'}
                </button>

                {isTranslated && (
                  <button
                    onClick={() => { setTranslatedText(''); setTranslateError(''); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Show Original
                  </button>
                )}
              </div>

              {translateError && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                  ⚠ {translateError}
                </div>
              )}

              {isTranslated && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-card)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Translated to {LANG_NAME_MAP[targetLang]}:
                  </div>
                  {translatedText}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Comments Section ───────────────────────────────────────────────────────────
const CommentsSection = ({ videoId }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setPage(1);
    setComments([]);
    fetchComments(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (page > 1) fetchComments(page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchComments = async (pageNum, reset) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.get(`/comments/${videoId}?page=${pageNum}&limit=15`);
      if (reset) setComments(res.data.comments);
      else setComments(prev => [...prev, ...res.data.comments]);
      setTotal(res.data.total);
    } catch (err) {
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // ── Location for comments ───────────────────────────────────────────────────
  // Try to read the user's live browser location (reverse-geocoded to a
  // city/region via a free, key-less API). If permission is denied, the
  // browser doesn't support geolocation, or anything fails, we fall back to
  // a default location so every comment still shows somewhere.
  const DEFAULT_LOCATION = { city: 'Tamil Nadu', region: 'India' };

  const getCommentLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(DEFAULT_LOCATION);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const data = await res.json();
            const city = data.city || data.locality || data.principalSubdivision || DEFAULT_LOCATION.city;
            const region = data.principalSubdivision || data.countryName || DEFAULT_LOCATION.region;
            resolve({ city, region });
          } catch {
            resolve(DEFAULT_LOCATION);
          }
        },
        () => resolve(DEFAULT_LOCATION), // permission denied / unavailable
        { timeout: 6000, maximumAge: 10 * 60 * 1000 }
      );
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const location = await getCommentLocation();
      const res = await api.post(`/comments/${videoId}`, { text, ...location });
      setComments(prev => [res.data.comment, ...prev]);
      setTotal(t => t + 1);
      setText('');
      toast.success('Comment posted!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId) => {
    if (!user) { toast.info('Login to like comments'); return; }
    try {
      const res = await api.post(`/comments/${commentId}/like`, { action: 'like' });
      setComments(prev => prev.map(c =>
        c._id === commentId
          ? { ...c, likeCount: res.data.likes, dislikeCount: res.data.dislikes, userLiked: !c.userLiked, userDisliked: false }
          : c
      ));
    } catch {}
  };

  const handleDislike = async (commentId) => {
    if (!user) { toast.info('Login to dislike comments'); return; }
    try {
      const res = await api.post(`/comments/${commentId}/like`, { action: 'dislike' });
      setComments(prev => prev.map(c =>
        c._id === commentId
          ? { ...c, likeCount: res.data.likes, dislikeCount: res.data.dislikes, userDisliked: !c.userDisliked, userLiked: false }
          : c
      ));
    } catch {}
  };

  const handleReport = async (commentId) => {
    await api.post(`/comments/${commentId}/report`, { reason: 'Inappropriate content' });
  };

  return (
    <div style={{ marginTop: 36 }}>
      <h3 style={{ marginBottom: 20, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
        💬 Comments
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>({total})</span>
      </h3>

      {/* Post comment box */}
      {user ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>
              {user.avatar
                ? <img src={user.avatar} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : user.username[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <textarea
                className="form-control"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write a comment... (supports any language 🌐)"
                rows={2}
                style={{ resize: 'vertical', marginBottom: 8 }}
                maxLength={1000}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleSubmit(e);
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {user.showLocation
                      ? '📍 Your location will be shown with this comment'
                      : '🔒 Your location is hidden (change in Profile settings)'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ctrl+Enter to post</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: text.length > 900 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {text.length}/1000
                  </span>
                  <button
                    onClick={handleSubmit}
                    className="btn btn-primary btn-sm"
                    disabled={submitting || !text.trim()}
                  >
                    {submitting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Post Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <a href="/login" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Login</a> to post a comment or like/translate others.
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : comments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
          <p>No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <>
          {comments.map(c => (
            <CommentItem
              key={c._id}
              comment={c}
              onLike={handleLike}
              onDislike={handleDislike}
              onReport={handleReport}
            />
          ))}

          {comments.length < total && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 16 }}
              disabled={loadingMore}
            >
              {loadingMore ? <span className="spinner" /> : `Load more comments (${total - comments.length} remaining)`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default CommentsSection;
