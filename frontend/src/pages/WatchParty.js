import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import VideoPlayer from '../components/VideoPlayer';
import api from '../utils/api';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || '';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

const WatchParty = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [party, setParty] = useState(null);
  const [video, setVideo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [videoState, setVideoState] = useState({ currentTime: 0, isPlaying: false });
  const [showParticipants, setShowParticipants] = useState(false);

  // FIX (mobile responsiveness): track viewport width reactively instead of
  // reading window.innerWidth directly during render. The old approach only
  // re-evaluated when some other state change happened to trigger a
  // re-render, so rotating the phone or resizing the window didn't actually
  // switch the layout between stacked (mobile) and side-by-side (desktop).
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // WebRTC / call state
  const [callActive, setCallActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> { stream, username, muted }
  const [screenSharerSocketId, setScreenSharerSocketId] = useState(null); // who is sharing screen right now

  const socketRef = useRef(null);
  const peerConnections = useRef({}); // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null); // single source of truth for local stream
  const localVideoRef = useRef(null);
  const remoteVideoEls = useRef({}); // socketId -> <video> DOM element (used for recording composite)
  const chatEndRef = useRef(null);
  const socketInitialized = useRef(false);
  const callActiveRef = useRef(false); // mirror of callActive for use inside closures
  const participantsRef = useRef([]); // always-current mirror of participants for use inside closures

  // Recording (host-only, stored locally on host's device)
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordScreenStreamRef = useRef(null); // the captured full-screen stream
  const recordAudioCtxRef = useRef(null);

  const isHost = party?.hostName === user?.username;

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    joinParty();
    return () => {
      cleanupAll();
      socketInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep participantsRef in sync so socket/closure callbacks always see fresh list
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Keep local video element in sync with stream
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callActive]);

  const joinParty = async () => {
    try {
      const res = await api.post(`/watchparty/${roomId}/join`);
      setParty(res.data.party);
      setVideo(res.data.video);

      const dbParticipants = (res.data.party.participants || []).map(p => ({
        userId: p.userId,
        username: p.username,
        socketId: null
      }));
      setParticipants(dbParticipants);

      if (!socketInitialized.current) {
        socketInitialized.current = true;
        initSocket();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to join party');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // ─── Create peer connection (only created ONCE per remote peer) ──────────────
  const createPeerConnection = useCallback((targetSocketId, stream) => {
    // Reuse the existing connection if we already have one for this peer.
    // IMPORTANT: a connection can exist here WITHOUT our local tracks on it —
    // e.g. it was created earlier to answer an incoming offer, at a time when
    // we hadn't started our own call yet (no local stream). If we now have a
    // stream and haven't actually sent any tracks on this connection, attach
    // them now. This is what previously caused one-directional video: the
    // host (or anyone) who joined the call AFTER a connection already existed
    // would never have their camera/mic tracks attached, so the other side
    // never received their audio/video even though signaling "succeeded".
    const existingPc = peerConnections.current[targetSocketId];
    if (existingPc) {
      if (stream) {
        const sentTrackIds = new Set(
          existingPc.getSenders().map(s => s.track?.id).filter(Boolean)
        );
        stream.getTracks().forEach(track => {
          if (!sentTrackIds.has(track.id)) {
            existingPc.addTrack(track, stream);
          }
        });
      }
      return existingPc;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    // "Polite" peer: the one with the lexicographically smaller socket id yields
    // on glare (simultaneous offers) and accepts the incoming offer instead of
    // fighting over whose offer wins. This fixes the case where host and a
    // participant both start the call around the same time and each side's
    // outgoing offer silently overwrites the other's connection state.
    pc.__polite = socketRef.current && socketRef.current.id < targetSocketId;
    pc.__makingOffer = false;
    peerConnections.current[targetSocketId] = pc;

    // Add all local tracks ONCE
    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice-candidate', { candidate, targetSocketId });
      }
    };

    pc.ontrack = ({ streams }) => {
      const remoteStream = streams[0];
      if (remoteStream) {
        setRemoteStreams(prev => ({
          ...prev,
          [targetSocketId]: {
            stream: remoteStream,
            username: null // filled from participants state
          }
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  }, []);

  // ─── Offer: caller side ──────────────────────────────────────────────────────
  const createOffer = useCallback(async (targetSocketId, stream) => {
    const pc = createPeerConnection(targetSocketId, stream);
    try {
      pc.__makingOffer = true;
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc-offer', { roomId, offer, targetSocketId });
    } catch (err) {
      console.error('createOffer error:', err);
    } finally {
      pc.__makingOffer = false;
    }
  }, [createPeerConnection, roomId]);

  // Self-healing: if I'm in a call and a participant has a socketId but I
  // have no remote stream from them after a few seconds, try offering again.
  // This covers edge cases like the offer being lost during a brief
  // disconnect/reconnect, or the other side joining the call a moment
  // after the user-joined event fired.
  useEffect(() => {
    if (!callActive) return;
    const interval = setInterval(() => {
      const currentSocketId = socketRef.current?.id;
      participants.forEach(p => {
        if (
          p.socketId &&
          p.socketId !== currentSocketId &&
          !remoteStreams[p.socketId] &&
          localStreamRef.current
        ) {
          // Privacy topology: the host connects to everyone, but a regular
          // participant only ever connects to the host (not to each other).
          // That way only the host can see/hear every camera, and other
          // participants can't see one another's video or call presence.
          const targetIsHost = p.username === party?.hostName;
          if (!isHost && !targetIsHost) return;

          const existingPc = peerConnections.current[p.socketId];
          if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'disconnected') {
            if (existingPc) {
              existingPc.close();
              delete peerConnections.current[p.socketId];
            }
            createOffer(p.socketId, localStreamRef.current);
          }
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [callActive, participants, remoteStreams, createOffer, isHost, party]);

  const initSocket = () => {
    if (socketRef.current) socketRef.current.disconnect();

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join-party', { roomId, userId: user._id, username: user.username });
    });

    socket.on('party-state', ({ participants: socketParticipants, videoState: vs }) => {
      setParticipants(socketParticipants);
      setVideoState(vs);
    });

    socket.on('user-joined', ({ username, socketId }) => {
      setParticipants(prev => {
        if (prev.find(p => p.socketId === socketId)) return prev;
        return [...prev, { username, socketId }];
      });
      toast.info(`${username} joined the party`);

      // If I'm already in a call, offer only per privacy topology:
      // host offers to every new joiner; a regular participant only offers
      // if the new joiner IS the host (never to a fellow participant).
      if (callActiveRef.current && localStreamRef.current) {
        const amHost = party?.hostName === user?.username;
        const joinerIsHost = username === party?.hostName;
        if (amHost || joinerIsHost) {
          createOffer(socketId, localStreamRef.current);
        }
      }
    });

    socket.on('user-left', ({ username, socketId }) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      setRemoteStreams(prev => {
        const s = { ...prev };
        delete s[socketId];
        return s;
      });
      delete remoteVideoEls.current[socketId];
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
      toast.info(`${username} left`);
    });

    socket.on('video-sync', ({ currentTime, isPlaying }) => {
      setVideoState({ currentTime, isPlaying });
    });

    socket.on('chat-message', (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    });

    socket.on('chat-message-sent', (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    });

    // ── WebRTC signaling ──────────────────────────────────────────────────────

    // Answerer side: got offer → create pc (if needed), handle glare politely, send answer
    socket.on('webrtc-offer', async ({ offer, fromSocketId }) => {
      const stream = localStreamRef.current;
      const pc = createPeerConnection(fromSocketId, stream);

      const offerCollision =
        pc.__makingOffer || pc.signalingState !== 'stable';

      // If there's a collision and we're the "impolite" peer, ignore the
      // incoming offer — our own offer will win and the other side will
      // back off instead (because it sees us as polite=false on its side).
      if (offerCollision && !pc.__polite) {
        console.log('Ignoring colliding offer (impolite peer)');
        return;
      }

      try {
        // Polite peer rolls back its own offer to accept the incoming one
        if (offerCollision && pc.__polite) {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(offer))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }

        // Make sure local tracks are attached
        if (stream && pc.getSenders().filter(s => s.track).length === 0) {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        // Flush any ICE candidates that arrived before we set remote description
        if (pc.__pendingCandidates?.length) {
          for (const c of pc.__pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { /* ignore */ }
          }
          pc.__pendingCandidates = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { answer, targetSocketId: fromSocketId });
      } catch (err) {
        console.error('webrtc-offer handling error:', err);
      }
    });

    socket.on('webrtc-answer', async ({ answer, fromSocketId }) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          if (pc.__pendingCandidates?.length) {
            for (const c of pc.__pendingCandidates) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { /* ignore */ }
            }
            pc.__pendingCandidates = [];
          }
        } catch (err) {
          console.error('setRemoteDescription (answer) error:', err);
        }
      }
    });

    socket.on('webrtc-ice-candidate', async ({ candidate, fromSocketId }) => {
      const pc = peerConnections.current[fromSocketId];
      if (!pc || !candidate) return;
      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // Remote description not set yet — queue this candidate
          if (!pc.__pendingCandidates) pc.__pendingCandidates = [];
          pc.__pendingCandidates.push(candidate);
        }
      } catch (err) {
        console.error('addIceCandidate error:', err);
      }
    });

    // Remote mute/unmute notification
    socket.on('call-control', ({ action, socketId: remoteSocketId }) => {
      if (action === 'mute' || action === 'unmute') {
        setRemoteStreams(prev => {
          if (!prev[remoteSocketId]) return prev;
          return { ...prev, [remoteSocketId]: { ...prev[remoteSocketId], muted: action === 'mute' } };
        });
      }
    });

    socket.on('screen-share-start', ({ socketId: sharerSocketId }) => {
      setScreenSharerSocketId(sharerSocketId);
      const sharerName = participantsRef.current.find(p => p.socketId === sharerSocketId)?.username || 'Someone';
      toast.info(`${sharerName} started screen sharing`);
    });

    socket.on('screen-share-stop', ({ socketId: sharerSocketId }) => {
      setScreenSharerSocketId(null);
      const sharerName = participantsRef.current.find(p => p.socketId === sharerSocketId)?.username || 'Someone';
      toast.info(`${sharerName} stopped screen sharing`);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
    });
  };

  // ─── Start video call ────────────────────────────────────────────────────────
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      callActiveRef.current = true;
      setCallActive(true);
      setMuted(false);
      setCameraOn(true);

      // Attach to local video element immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Offer to participants per privacy topology: host offers to
      // everyone; a regular participant only offers to the host, so
      // non-host users never establish peer connections with each other.
      const currentSocketId = socketRef.current?.id;
      setParticipants(prev => {
        prev.forEach(p => {
          if (!p.socketId || p.socketId === currentSocketId) return;
          const targetIsHost = p.username === party?.hostName;
          if (isHost || targetIsHost) {
            createOffer(p.socketId, stream);
          }
        });
        return prev;
      });
    } catch (err) {
      console.error('getUserMedia error:', err);
      toast.error('Could not access camera/microphone. Please allow permissions.');
    }
  };

  // ─── Mute / Camera ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setMuted(newMuted);
    socketRef.current?.emit('call-control', { roomId, action: newMuted ? 'mute' : 'unmute' });
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newCameraOn = !cameraOn;
    stream.getVideoTracks().forEach(t => { t.enabled = newCameraOn; });
    setCameraOn(newCameraOn);
  };

  // ─── Screen share ────────────────────────────────────────────────────────────
  const startScreenShare = async () => {
    if (screenSharing) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      setScreenSharing(true);
      setScreenSharerSocketId(socketRef.current?.id); // mark self as sharer
      socketRef.current?.emit('screen-share-start', { roomId });

      // Build the stream we'll send peers: screen video + our mic audio
      const screenWithAudio = new MediaStream([
        screenTrack,
        ...(localStreamRef.current?.getAudioTracks() || [])
      ]);

      // Step 1: Replace video track in ALL existing peer connections so those
      // peers immediately see the screen instead of the camera
      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Step 2: Create NEW peer connections to participants we have no connection
      // to yet. Normally non-host users only connect to the host, so a non-host
      // sharer's screen would be invisible to other non-host participants.
      // We bypass the topology here: screen sharing must reach EVERYONE.
      const currentSocketId = socketRef.current?.id;
      participantsRef.current.forEach(p => {
        if (!p.socketId || p.socketId === currentSocketId) return;
        if (!peerConnections.current[p.socketId]) {
          createOffer(p.socketId, screenWithAudio);
        }
      });

      // Step 3: Update local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenWithAudio;
      }

      // When user stops sharing via browser "Stop sharing" bar
      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        toast.error('Screen share failed');
      }
    }
  };

  const stopScreenShare = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const camTrack = stream.getVideoTracks()[0];
    // Restore camera track in all peer connections
    Object.values(peerConnections.current).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });
    // Restore local preview
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    setScreenSharing(false);
    setScreenSharerSocketId(null);
    socketRef.current?.emit('screen-share-stop', { roomId });
  };

  // ─── Recording (host-only, current-tab capture, never uploaded) ─────────────
  // Records the watch party page itself — not the full desktop. Chrome/Edge
  // support `preferCurrentTab: true` which pre-selects this tab in the picker
  // so the host just clicks "Share" without hunting for it. On other browsers
  // the picker still opens and the host can manually select "This Tab".
  // Call audio (local mic + all remote participants) is mixed in via Web Audio.
  // The result is saved as .webm to the host's device — never sent to server.
  const startRecording = async () => {
    if (!isHost) {
      toast.error('Only the host can record this session');
      return;
    }
    try {
      toast.info('In the picker, select "This Tab" to record only the watch party page');

      // preferCurrentTab pre-selects this tab on Chrome/Edge (Chromium 102+).
      // displaySurface: 'browser' hints to show the tab option first.
      // Falls back gracefully on Firefox — picker opens normally.
      const tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 30 },
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: true
      });
      recordScreenStreamRef.current = tabStream;

      // Mix audio: captured tab audio + local mic + every remote participant
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      recordAudioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      const addAudio = (stream) => {
        if (!stream || stream.getAudioTracks().length === 0) return;
        try { audioCtx.createMediaStreamSource(stream).connect(dest); } catch { /* ignore */ }
      };
      addAudio(tabStream);                                              // tab audio
      addAudio(localStreamRef.current);                                 // host mic
      Object.values(remoteStreams).forEach(({ stream }) => addAudio(stream)); // all peers

      const combinedStream = new MediaStream([
        ...tabStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `watchparty-${roomId}-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success('Recording saved to your device');
      };

      // If host dismisses the tab share via browser's stop bar, end gracefully
      tabStream.getVideoTracks()[0].onended = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          stopRecording();
        }
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      toast.info('Recording this watch party tab — saved locally, host only');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('Recording error:', err);
        toast.error('Could not start recording');
      }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (recordScreenStreamRef.current) {
      recordScreenStreamRef.current.getTracks().forEach(t => t.stop());
      recordScreenStreamRef.current = null;
    }
    if (recordAudioCtxRef.current) {
      recordAudioCtxRef.current.close();
      recordAudioCtxRef.current = null;
    }
    setIsRecording(false);
  };

  // ─── Leave call ──────────────────────────────────────────────────────────────
  const leaveCall = () => {
    if (isRecording) stopRecording();
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    callActiveRef.current = false;
    setCallActive(false);
    setRemoteStreams({});
    setScreenSharing(false);
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
  };

  const cleanupAll = () => {
    leaveCall();
    if (socketRef.current) {
      socketRef.current.emit('leave-party', { roomId, username: user?.username });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatText.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', {
      roomId,
      message: chatText.trim(),
      username: user.username,
      userId: user._id
    });
    setChatText('');
  };

  const handleVideoSync = (currentTime, isPlaying) => {
    socketRef.current?.emit('video-sync', { roomId, currentTime, isPlaying, action: isPlaying ? 'play' : 'pause' });
  };

  const endParty = async () => {
    try {
      await api.post(`/watchparty/${roomId}/end`);
      cleanupAll();
      navigate('/');
      toast.success('Watch party ended');
    } catch {
      toast.error('Failed to end party');
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!party || !video) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p>Party not found or video unavailable.</p>
      <button onClick={() => navigate('/')} className="btn btn-primary" style={{ marginTop: 12 }}>Go Home</button>
    </div>
  );

  return (
    <div className="watch-party-root" style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 20 }}>🎉</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Room: <strong style={{ fontFamily: 'monospace' }}>{roomId}</strong> · Host: {party.hostName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowParticipants(s => !s)} className="btn btn-secondary btn-sm">
            👥 {participants.length}
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Invite link copied!'); }}
            className="btn btn-secondary btn-sm"
          >
            📋 Invite
          </button>
          {isHost && <button onClick={endParty} className="btn btn-danger btn-sm">End Party</button>}
          <button onClick={() => { cleanupAll(); navigate('/'); }} className="btn btn-secondary btn-sm">Leave</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Main area */}
        <div style={{ flex: 1, padding: isMobile ? 10 : 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {video.cloudinaryUrl ? (
            <VideoPlayer
              src={video.cloudinaryUrl}
              poster={video.thumbnailUrl}
              isPartyMode
              externalCurrentTime={videoState.currentTime}
              externalIsPlaying={videoState.isPlaying}
              onPlayPause={(isPlaying, currentTime) => handleVideoSync(currentTime, isPlaying)}
              onTimeUpdate={(t) => handleVideoSync(t, videoState.isPlaying)}
            />
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <p>Video URL not available.</p>
            </div>
          )}

          {/* Video call section */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
            {!callActive ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={startCall} className="btn btn-primary">📹 Join Video Call</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Join to see and hear other participants</span>
              </div>
            ) : (
              <div>
                {/* Call controls */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    onClick={toggleMute}
                    className={`btn btn-sm ${muted ? 'btn-danger' : 'btn-secondary'}`}
                    title={muted ? 'Unmute mic' : 'Mute mic'}
                  >
                    {muted ? '🔇 Unmute' : '🎙 Mute'}
                  </button>
                  <button
                    onClick={toggleCamera}
                    className={`btn btn-sm ${!cameraOn ? 'btn-danger' : 'btn-secondary'}`}
                    title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  >
                    {cameraOn ? '📷 Cam Off' : '📷 Cam On'}
                  </button>
                  <button
                    onClick={screenSharing ? stopScreenShare : startScreenShare}
                    className={`btn btn-sm ${screenSharing ? 'btn-primary' : 'btn-secondary'}`}
                    title={screenSharing ? 'Stop sharing' : 'Share your screen with everyone'}
                  >
                    🖥 {screenSharing ? 'Stop Share' : 'Share Screen'}
                  </button>
                  <button onClick={leaveCall} className="btn btn-danger btn-sm" title="Leave video call">
                    📵 Leave Call
                  </button>
                  {isHost && (
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`btn btn-sm ${isRecording ? 'btn-danger' : 'btn-secondary'}`}
                      title={isRecording ? 'Stop screen recording' : 'Record your full screen — saved locally, host-only'}
                    >
                      {isRecording ? '⏹ Stop Recording' : '⏺ Record Screen'}
                    </button>
                  )}
                </div>

                {/* ── Prominent shared screen view (visible to everyone) ── */}
                {screenSharerSocketId && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      fontSize: 11, color: 'var(--accent-light)', marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 6
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)',
                        display: 'inline-block', animation: 'pulse 1.5s infinite'
                      }} />
                      🖥 {screenSharerSocketId === socketRef.current?.id
                        ? 'You are sharing your screen'
                        : `${participants.find(p => p.socketId === screenSharerSocketId)?.username || 'Someone'} is sharing their screen`
                      }
                    </div>
                    <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', border: '2px solid var(--accent)' }}>
                      {screenSharerSocketId === socketRef.current?.id ? (
                        // Local sharer preview — reuse the localVideoRef element
                        <video
                          autoPlay muted playsInline
                          style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }}
                          ref={el => {
                            localVideoRef.current = el;
                            if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                              el.srcObject = localStreamRef.current;
                            }
                          }}
                        />
                      ) : (
                        // Remote shared screen
                        (() => {
                          const s = remoteStreams[screenSharerSocketId];
                          if (!s) return (
                            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                              Connecting to screen share...
                            </div>
                          );
                          return (
                            <video
                              key={`screen-${screenSharerSocketId}`}
                              autoPlay playsInline
                              style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }}
                              ref={el => { if (el && el.srcObject !== s.stream) el.srcObject = s.stream; }}
                            />
                          );
                        })()
                      )}
                      <div style={{
                        position: 'absolute', bottom: 6, left: 8,
                        background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11,
                        padding: '3px 8px', borderRadius: 4
                      }}>
                        🖥 Shared Screen
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Camera tiles grid (everyone's camera feed) ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                  {/* My own video tile */}
                  <div style={{ position: 'relative', background: '#111', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                    <video
                      ref={el => {
                        localVideoRef.current = el;
                        if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                          el.srcObject = localStreamRef.current;
                        }
                      }}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {!cameraOn && !screenSharing && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', background: '#1a1a2e'
                      }}>
                        <div style={{ fontSize: 32 }}>👤</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Camera off</div>
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', bottom: 4, left: 4, right: 4,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                        {user.username} (You)
                      </span>
                      {muted && <span style={{ fontSize: 14, background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 4px' }}>🔇</span>}
                    </div>
                    {screenSharing && (
                      <div style={{ position: 'absolute', top: 4, right: 4, background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                        Sharing
                      </div>
                    )}
                  </div>

                  {/* Remote video tiles — visible to everyone */}
                  {Object.entries(remoteStreams).map(([socketId, { stream, muted: remoteMuted }]) => {
                    const p = participants.find(pt => pt.socketId === socketId);
                    return (
                      <div key={socketId} style={{ position: 'relative', background: '#111', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                        <video
                          autoPlay
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          ref={el => {
                            if (el && el.srcObject !== stream) el.srcObject = stream;
                            remoteVideoEls.current[socketId] = el;
                          }}
                        />
                        <div style={{
                          position: 'absolute', bottom: 4, left: 4, right: 4,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                            {p?.username || 'Participant'}
                          </span>
                          {remoteMuted && <span style={{ fontSize: 14, background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 4px' }}>🔇</span>}
                        </div>
                        {socketId === screenSharerSocketId && (
                          <div style={{ position: 'absolute', top: 4, right: 4, background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                            🖥 Sharing
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {Object.keys(remoteStreams).length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                    Waiting for others to join the call...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat sidebar */}
        <div style={{
          width: isMobile ? '100%' : 320,
          height: isMobile ? '50vh' : 'auto',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderLeft: isMobile ? 'none' : '1px solid var(--border)',
          borderTop: isMobile ? '1px solid var(--border)' : 'none'
        }}>
          {showParticipants ? (
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Participants ({participants.length})</span>
                <button onClick={() => setShowParticipants(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              {isHost ? (
                participants.map((p, i) => (
                  <div key={p.socketId || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                      {(p.username || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14 }}>{p.username}</span>
                    {p.username === party.hostName && (
                      <span style={{ fontSize: 10, color: 'var(--accent-light)', background: 'rgba(124,58,237,0.15)', padding: '1px 6px', borderRadius: 8 }}>Host</span>
                    )}
                    {/* Show 📹 if they're in the call */}
                    {Object.keys(remoteStreams).includes(p.socketId) && (
                      <span style={{ fontSize: 12, marginLeft: 'auto' }}>📹</span>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <p style={{ marginBottom: 10 }}>
                    🔒 For everyone's privacy, only the host can see the full participant list and other people's camera feeds.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                      {(party.hostName || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14 }}>{party.hostName}</span>
                    <span style={{ fontSize: 10, color: 'var(--accent-light)', background: 'rgba(124,58,237,0.15)', padding: '1px 6px', borderRadius: 8 }}>Host</span>
                  </div>
                  <p style={{ marginTop: 10 }}>{participants.length} people total are in this party.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
                💬 Party Chat
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 400 }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
                    No messages yet. Say hello! 👋
                  </div>
                ) : messages.map(m => (
                  <div key={m.id} style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: m.username === user.username ? 'var(--success)' : 'var(--accent-light)' }}>
                      {m.username === user.username ? 'You' : m.username}:{' '}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{m.message}</span>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChat} style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  className="form-control"
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, fontSize: 13 }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!chatText.trim()}>Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WatchParty;
