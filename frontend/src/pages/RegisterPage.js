import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const RegisterPage = () => {
  const { register, verifyOTP } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [otp, setOtp] = useState('');
  const [otpData, setOtpData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const result = await register(form.username, form.email, form.password);
      if (result.requiresOTP) {
        setOtpData(result);
        toast.info('OTP sent to your email to verify this device');
      } else {
        toast.success('Account created! Welcome to VideoStream 🎬');
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
      toast.success('Account verified! Welcome to VideoStream 🎬');
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            {otpData ? 'Verify Your Email' : 'Create Account'}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {otpData ? 'Enter the OTP sent to your email' : 'Join VideoStream for free'}
          </p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}

          {!otpData ? (
            <form onSubmit={handleSubmit}>
              {[
                { key: 'username', label: 'Username', type: 'text', placeholder: 'Pick a username' },
                { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
                { key: 'password', label: 'Password', type: 'password', placeholder: 'Min. 6 characters' },
                { key: 'confirm', label: 'Confirm Password', type: 'password', placeholder: 'Repeat your password' }
              ].map(({ key, label, type, placeholder }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input
                    className="form-control"
                    type={type}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    required
                  />
                </div>
              ))}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Create Account'}
              </button>
            </form>
          ) : (
            /* ── OTP Verification Form ── */
            <form onSubmit={handleOTPVerify}>
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  🔒 Verify This Device
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
                {loading ? <span className="spinner" /> : '✅ Verify & Create Account'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => { setOtpData(null); setOtp(''); setError(''); }}
              >
                ← Back
              </button>
            </form>
          )}

          {!otpData && (
            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--accent-light)' }}>Sign in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
