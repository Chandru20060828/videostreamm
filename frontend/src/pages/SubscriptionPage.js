import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const PLAN_INFO = {
  free: {
    color: '#6b7280', icon: '🎬', price: '₹0', period: 'Forever', downloads: '1/day',
    features: ['SD quality streaming', '1 download/day', 'Basic watch parties', 'Ads included']
  },
  bronze: {
    color: '#d97706', icon: '🥉', price: '₹99', period: '/month', downloads: '5/day',
    features: ['HD streaming', '5 downloads/day', 'No ads', 'Watch parties', 'Priority chat']
  },
  silver: {
    color: '#9ca3af', icon: '🥈', price: '₹199', period: '/month', downloads: '15/day',
    features: ['Full HD streaming', '15 downloads/day', 'No ads', 'Watch parties', 'Priority support', 'Early access to videos']
  },
  gold: {
    color: '#f59e0b', icon: '🥇', price: '₹399', period: '/month', downloads: 'Unlimited',
    features: ['4K streaming', 'Unlimited downloads', 'No ads', 'Watch parties', 'Priority support', 'Early access', 'Exclusive content']
  }
};

const planRank = { free: 0, bronze: 1, silver: 2, gold: 3 };

const SubscriptionPage = () => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [planData, setPlanData] = useState(null);
  const [plansConfig, setPlansConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetchInfo();
  }, []);

  const fetchInfo = async () => {
    try {
      const [plansRes, planDataRes] = await Promise.all([
        api.get('/subscription/plans'),
        user ? api.get('/subscription/my-plan') : Promise.resolve({ data: null })
      ]);
      setPlansConfig(plansRes.data);
      if (planDataRes.data) setPlanData(planDataRes.data);
    } catch (err) {
      toast.error('Failed to load subscription info');
    } finally {
      setPageLoading(false);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgrade = async (plan) => {
    if (!user) {
      toast.info('Please login to upgrade');
      window.location.href = '/login';
      return;
    }
    if (plan === user.plan) {
      toast.info('You are already on this plan');
      return;
    }

    // FIX Task 3: Check if Razorpay is configured before attempting
    if (!plansConfig?.configured) {
      toast.error('Payment is not configured yet. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your backend .env file.');
      return;
    }

    setLoading(plan);
    try {
      // Load Razorpay script dynamically
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Failed to load Razorpay. Check your internet connection.');
        setLoading(false);
        return;
      }

      const res = await api.post('/subscription/create-order', { plan });
      const { orderId, amount, currency, keyId } = res.data;

      const options = {
        key: keyId,
        amount,
        currency,
        name: 'VideoStream',
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — 1 Month`,
        order_id: orderId,
        handler: async (response) => {
          try {
            const verRes = await api.post('/subscription/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan
            });
            updateUser({ plan: verRes.data.plan });
            toast.success(`🎉 Upgraded to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! Invoice sent to your email.`);
            fetchInfo();
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed. Contact support.');
          }
        },
        prefill: { name: user.username, email: user.email },
        theme: { color: '#7c3aed' },
        modal: {
          ondismiss: () => {
            setLoading(false);
            toast.info('Payment cancelled');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response) => {
        toast.error(`Payment failed: ${response.error.description}`);
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      const msg = err.response?.data?.message || 'Payment initiation failed';
      toast.error(msg);
      setLoading(false);
    }
  };

  if (pageLoading) return <div className="loading-center"><div className="spinner" /></div>;

  const currentPlan = user?.plan || 'free';

  return (
    <div className="container" style={{ padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, marginBottom: 8 }}>
          ⭐ Choose Your Plan
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Upgrade to unlock more downloads, higher quality, and exclusive features
        </p>
        {user && planData && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={`badge badge-${currentPlan}`} style={{ fontSize: 13, padding: '6px 16px' }}>
              Current: {currentPlan.toUpperCase()}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              📥 {planData.downloadsRemaining} downloads remaining today
            </span>
          </div>
        )}
      </div>

      {/* Razorpay not configured warning */}
      {plansConfig && !plansConfig.configured && (
        <div className="alert alert-error" style={{ maxWidth: 700, margin: '0 auto 24px', fontSize: 13 }}>
          <strong>⚠ Razorpay Not Configured</strong><br />
          Payment is disabled. To enable it, add your Razorpay test keys to <code>backend/.env</code>:<br />
          <code>RAZORPAY_KEY_ID=rzp_test_xxxxx</code><br />
          <code>RAZORPAY_KEY_SECRET=your_secret</code><br />
          Get free test keys at <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-light)' }}>dashboard.razorpay.com</a>
        </div>
      )}

      {/* Razorpay test mode info */}
      {plansConfig?.configured && (
        <div className="alert alert-info" style={{ maxWidth: 700, margin: '0 auto 24px', fontSize: 13 }}>
          🧪 <strong>Test Mode Active</strong> — Use test card: <code>4111 1111 1111 1111</code>, any future expiry, any CVV.
          No real money will be charged.
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
        {Object.entries(PLAN_INFO).map(([plan, info]) => {
          const isCurrent = plan === currentPlan;
          const isUpgrade = planRank[plan] > planRank[currentPlan];

          return (
            <div
              key={plan}
              className="card"
              style={{
                border: isCurrent ? `2px solid ${info.color}` : '1px solid var(--border)',
                position: 'relative',
                transition: 'transform 0.2s, box-shadow 0.2s',
                paddingTop: plan === 'gold' ? 32 : 20
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(0,0,0,0.3)`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
            >
              {plan === 'gold' && (
                <div style={{
                  position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                  background: '#f59e0b', color: '#000', fontSize: 11, fontWeight: 800,
                  padding: '4px 16px', borderRadius: '0 0 8px 8px', whiteSpace: 'nowrap'
                }}>
                  ⭐ MOST POPULAR
                </div>
              )}
              {isCurrent && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: info.color, color: '#fff',
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100
                }}>
                  ✓ ACTIVE
                </div>
              )}

              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>{info.icon}</div>
                <h3 style={{ textTransform: 'capitalize', marginBottom: 6, fontSize: 18 }}>{plan}</h3>
                <div style={{ fontSize: 30, fontWeight: 800, color: info.color }}>
                  {info.price}
                  <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{info.period}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  📥 {info.downloads} downloads/day
                </div>
              </div>

              <ul style={{ listStyle: 'none', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {info.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span style={{ color: info.color, flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {plan === 'free' ? (
                <button className="btn btn-secondary" style={{ width: '100%' }} disabled>
                  {isCurrent ? '✓ Current Plan' : 'Free Plan'}
                </button>
              ) : (
                <button
                  className="btn"
                  style={{
                    width: '100%',
                    background: isCurrent ? 'var(--bg-hover)' : info.color,
                    color: isCurrent ? 'var(--text-muted)' : '#fff',
                    cursor: isCurrent ? 'default' : 'pointer',
                    fontWeight: 600
                  }}
                  onClick={() => !isCurrent && handleUpgrade(plan)}
                  disabled={isCurrent || loading === plan}
                >
                  {loading === plan ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span className="spinner" style={{ width: 16, height: 16 }} />
                      Processing...
                    </span>
                  ) : isCurrent ? '✓ Current Plan'
                    : isUpgrade ? `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`
                      : `Switch to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Download History */}
      {user && planData?.downloadHistory?.length > 0 && (
        <div style={{ maxWidth: 1000, margin: '40px auto 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16 }}>📥 Recent Downloads</h3>
            <Link to="/downloads" style={{ fontSize: 13, color: 'var(--accent-light)' }}>View All →</Link>
          </div>
          <div className="card">
            {planData.downloadHistory.slice(0, 5).map((d, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                flexWrap: 'wrap', gap: 10
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ width: 48, height: 30, borderRadius: 4, background: 'var(--bg-hover)', overflow: 'hidden', flexShrink: 0 }}>
                    {d.thumbnailUrl
                      ? <img src={d.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.videoTitle}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(d.downloadDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                {d.cloudinaryUrl && (
                  <a href={d.cloudinaryUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    ↓ Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan comparison footer */}
      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: 13 }}>
        All paid plans auto-renew monthly. Cancel anytime. Prices in INR.
      </div>
    </div>
  );
};

export default SubscriptionPage;
