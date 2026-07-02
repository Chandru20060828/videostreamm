import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const MyPartiesPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinRoomId, setJoinRoomId] = useState('');

  useEffect(() => {
    if (user) fetchParties();
  }, [user]);

  const fetchParties = async () => {
    try {
      const res = await api.get('/watchparty/user/my-parties');
      setParties(res.data.parties);
    } catch {
      toast.error('Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    navigate(`/watch-party/${joinRoomId.trim().toUpperCase()}`);
  };

  if (!user) return (
    <div className="container" style={{ padding: '60px 16px', textAlign: 'center' }}>
      <p>Please <Link to="/login">login</Link> to view your watch parties.</p>
    </div>
  );

  return (
    <div className="container" style={{ padding: '32px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🎉 Watch Parties</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>Watch videos together with friends in real time</p>

      {/* Join by room ID */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12 }}>Join a Party by Room ID</h4>
        <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-control"
            placeholder="Enter Room ID (e.g. AB12CD34)"
            value={joinRoomId}
            onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
            style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 2 }}
            maxLength={8}
          />
          <button type="submit" className="btn btn-primary" disabled={joinRoomId.length < 4}>
            Join
          </button>
        </form>
      </div>

      {/* Party history */}
      <h3 style={{ marginBottom: 16, fontSize: 15 }}>Your Party History</h3>

      {loading ? <div className="loading-center"><div className="spinner" /></div>
        : parties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ marginBottom: 16 }}>No watch parties yet.</p>
            <p style={{ fontSize: 13, marginBottom: 20 }}>Open any video and click "Watch Party" to start one!</p>
            <Link to="/" className="btn btn-primary">Browse Videos</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {parties.map(p => (
              <div key={p._id} className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {p.videoId?.thumbnailUrl ? (
                  <img
                    src={p.videoId.thumbnailUrl}
                    alt={p.videoId?.title}
                    style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 100, height: 60, background: 'var(--bg-hover)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🎬</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.videoId?.title || 'Deleted Video'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Room: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.roomId}</span>
                    {' · '}Host: {p.hostName}
                    {' · '}{p.participants?.length || 0} participants
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(p.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {p.isActive ? (
                    <Link to={`/watch-party/${p.roomId}`} className="btn btn-primary btn-sm">
                      🎉 Rejoin
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
                      Ended
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default MyPartiesPage;
