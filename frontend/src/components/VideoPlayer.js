import React, { useRef, useState, useEffect, useCallback } from 'react';

const VideoPlayer = ({ src, poster, onTimeUpdate, externalCurrentTime, externalIsPlaying, onPlayPause, isPartyMode, nextVideo, onEnded }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [tapSide, setTapSide] = useState(null); // for double-tap gesture
  const tapTimeout = useRef(null);
  const tapCount = useRef(0);
  const hideControlsTimer = useRef(null);

  // Sync with party mode
  useEffect(() => {
    if (isPartyMode && videoRef.current) {
      if (externalCurrentTime !== undefined && Math.abs(videoRef.current.currentTime - externalCurrentTime) > 2) {
        videoRef.current.currentTime = externalCurrentTime;
      }
      if (externalIsPlaying !== undefined) {
        if (externalIsPlaying && videoRef.current.paused) videoRef.current.play().catch(() => {});
        else if (!externalIsPlaying && !videoRef.current.paused) videoRef.current.pause();
      }
    }
  }, [externalCurrentTime, externalIsPlaying, isPartyMode]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
      if (onPlayPause) onPlayPause(true, videoRef.current.currentTime);
    } else {
      videoRef.current.pause();
      setPlaying(false);
      if (onPlayPause) onPlayPause(false, videoRef.current.currentTime);
    }
    resetHideTimer();
  }, [onPlayPause, resetHideTimer]);

  const seek = useCallback((seconds) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    if (onTimeUpdate) onTimeUpdate(newTime, playing);
    resetHideTimer();
  }, [duration, playing, onTimeUpdate, resetHideTimer]);

  const handleDoubleTap = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const tapX = (e.touches?.[0]?.clientX || e.clientX) - rect.left;
    const isRight = tapX > rect.width / 2;

    tapCount.current += 1;
    clearTimeout(tapTimeout.current);
    tapTimeout.current = setTimeout(() => {
      if (tapCount.current >= 2) {
        if (isRight) {
          seek(10);
          setTapSide('right');
        } else {
          seek(-10);
          setTapSide('left');
        }
        setTimeout(() => setTapSide(null), 800);
      } else {
        togglePlay();
      }
      tapCount.current = 0;
    }, 250);
  }, [seek, togglePlay]);

  const handleProgress = (e) => {
    const rect = progressRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = pct * duration;
    videoRef.current.currentTime = newTime;
    if (onTimeUpdate) onTimeUpdate(newTime, playing);
  };

  const toggleMute = () => {
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    videoRef.current.volume = v;
    setVolume(v);
    setMuted(v === 0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setFullscreen(false));
    }
  };

  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: '#000',
        borderRadius: fullscreen ? 0 : 'var(--radius)',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: showControls ? 'default' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullscreen ? '100vw' : '100%',
        height: fullscreen ? '100vh' : 'auto'
      }}
      onMouseMove={resetHideTimer}
      onClick={handleDoubleTap}
      onTouchEnd={handleDoubleTap}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        style={{
          width: fullscreen ? '100%' : '100%',
          height: fullscreen ? '100%' : 'auto',
          maxWidth: '100%',
          maxHeight: fullscreen ? '100vh' : '70vh',
          display: 'block',
          margin: '0 auto',
          objectFit: 'contain'
        }}
        onTimeUpdate={() => {
          const t = videoRef.current.currentTime;
          setCurrentTime(t);
          if (onTimeUpdate && !isPartyMode) onTimeUpdate(t, !videoRef.current.paused);
        }}
        onLoadedMetadata={() => setDuration(videoRef.current.duration)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => { setLoading(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        playsInline
      />

      {/* Loading spinner */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
        </div>
      )}

      {/* Tap indicators */}
      {tapSide && (
        <div style={{
          position: 'absolute',
          [tapSide === 'left' ? 'left' : 'right']: '15%',
          top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 50,
          padding: '16px 20px',
          fontSize: 24,
          animation: 'fadeInOut 0.8s ease',
          pointerEvents: 'none'
        }}>
          {tapSide === 'left' ? '⏪ -10s' : '+10s ⏩'}
        </div>
      )}

      {/* Controls overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        width: '100%',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
        padding: '40px 16px 16px',
        transition: 'opacity 0.3s',
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? 'all' : 'none',
        boxSizing: 'border-box'
      }}
        onClick={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, cursor: 'pointer', marginBottom: 12 }}
          onClick={handleProgress}
        >
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, position: 'relative' }}>
            <div style={{
              position: 'absolute', right: -6, top: -4,
              width: 12, height: 12, background: '#fff',
              borderRadius: '50%', boxShadow: '0 0 4px rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Play/Pause */}
          <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: '4px 8px' }}>
            {playing ? '⏸' : '▶️'}
          </button>

          {/* Seek buttons */}
          <button onClick={() => seek(-10)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }} title="-10s">⏪</button>
          <button onClick={() => seek(10)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }} title="+10s">⏩</button>

          {/* Volume */}
          <button onClick={toggleMute} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>
            {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range" min="0" max="1" step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolume}
            className="hide-mobile"
            style={{ width: 70, accentColor: 'var(--accent)' }}
          />

          {/* Time */}
          <span style={{ color: '#fff', fontSize: 13, marginLeft: 4 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div style={{ flex: 1 }} />

          {/* Next video */}
          {nextVideo && (
            <button onClick={onEnded} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Next ⏭
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>
            {fullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeInOut { 0%{opacity:0} 20%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
      `}</style>
    </div>
  );
};

export default VideoPlayer;
