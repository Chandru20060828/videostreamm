import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import VideoCard from '../components/VideoCard';
import api from '../utils/api';

const CATEGORIES = ['All', 'General', 'Education', 'Entertainment', 'Music', 'Gaming', 'Sports', 'Tech', 'News'];

const HomePage = () => {
  const [searchParams] = useSearchParams();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState(searchParams.get('search') || '');

  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    fetchVideos();
  }, [page, category, search]);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 12 });
      if (search) params.set('search', search);
      if (category !== 'All') params.set('category', category);
      const res = await api.get(`/videos?${params}`);
      if (page === 1) setVideos(res.data.videos);
      else setVideos(prev => [...prev, ...res.data.videos]);
      setTotalPages(res.data.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setPage(1);
    setVideos([]);
  };

  return (
    <div>
      {/* Hero banner */}
      <div style={{ background: 'linear-gradient(135deg, #1a0533 0%, #0f0f1a 50%, #0d1a3a 100%)', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 800, marginBottom: 12 }}>
          🎬 VideoStream
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(13px, 3vw, 16px)' }}>
          Upload, watch and share videos with the world
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <input
            className="form-control"
            placeholder="🔍 Search videos..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); setVideos([]); }}
            style={{ maxWidth: 380, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
          />
        </div>
      </div>

      <div className="container" style={{ padding: '24px 16px' }}>
        {/* Category tabs */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`tab-btn ${category === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {search && (
          <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
            Search results for: <strong style={{ color: 'var(--text-primary)' }}>"{search}"</strong>
            <button onClick={() => { setSearch(''); setPage(1); setVideos([]); }}
              style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent-light)', cursor: 'pointer', fontSize: 13 }}>
              ✕ Clear
            </button>
          </div>
        )}

        {loading && page === 1 ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : videos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No videos found</div>
            <div style={{ fontSize: 13 }}>Be the first to upload!</div>
          </div>
        ) : (
          <>
            <div className="video-grid">
              {videos.map(video => <VideoCard key={video._id} video={video} />)}
            </div>

            {page < totalPages && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="btn btn-secondary"
                  disabled={loading}
                  style={{ minWidth: 140 }}
                >
                  {loading ? <span className="spinner" /> : 'Load More Videos'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
