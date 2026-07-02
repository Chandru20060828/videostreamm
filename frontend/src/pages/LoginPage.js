import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const LoginPage = () => {
  const { login, verifyOTP } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [otpData, setOtpData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [themeInfo, setThemeInfo] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(form.email, form.password);
      if (result.requiresOTP) {
        setOtpData(result);
        toast.info('OTP sent to your email');
      } else {
        // FIX Task 5: Show theme notification
        if (result.autoTheme) {
          setThemeInfo({ theme: result.autoTheme, istTime: result.istTime });
        }
        toast.success('Welcome back!');
        setTimeout(() => navigate('/'), 300);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      await verifyOTP(otpData.userId, otp);
      toast.success('Verified! Welcome back.');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResending(true);
    try {
      await api.post('/auth/resend-otp', { userId: otpData.userId });
      toast.success('New OTP sent to your email');
      setOtp('');
      setError('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16, background: 'var(--bg-primary)'
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>VideoStream</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
            {otpData ? '🔐 Identity Verification Required' : 'Sign in to your account'}
          </p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}

          {!otpData ? (
            /* ── Login Form ── */
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email</label>
                <input
                  className="form-control"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required autoFocus
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  className="form-control"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 4 }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Sign In'}
              </button>
            </form>
          ) : (
            /* ── OTP Verification Form ── */
            <form onSubmit={handleOTPVerify}>
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  🔒 New {otpData.reason === 'new device' ? 'Device' : 'Location'} Detected
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {otpData.message}
                </div>
                {otpData.city && otpData.city !== 'Unknown' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    📍 Detected location: <strong>{otpData.city}, {otpData.region}</strong>
                  </div>
                )}
                {otpData.deviceInfo && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    💻 Device: <strong>{otpData.deviceInfo}</strong>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Enter OTP Code</label>
                <input
                  className="form-control"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required autoFocus
                  style={{ textAlign: 'center', letterSpacing: 10, fontSize: 22, fontWeight: 700 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Valid for 10 minutes</span>
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={resending}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: 12, cursor: 'pointer' }}
                  >
                    {resending ? 'Sending...' : 'Resend OTP'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={loading || otp.length !== 6}
              >
                {loading ? <span className="spinner" /> : '✅ Verify & Login'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => { setOtpData(null); setOtp(''); setError(''); }}
              >
                ← Back to Login
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Sign up free</Link>
          </div>
        </div>

        {/* Security info */}
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div>🔒 <strong>Device Security:</strong> New device/browser triggers OTP verification</div>
            <div>📍 <strong>Location Security:</strong> New city or state triggers OTP verification</div>
            <div>🎨 <strong>Smart Theme:</strong> Light theme auto-applied between 10 AM–12 PM IST</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
