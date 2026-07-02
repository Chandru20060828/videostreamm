const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../utils/email');

// FIX Task 3: Lazy-initialize Razorpay so missing keys don't crash the server at startup.
// Also provides clear error messages when keys are not configured.
let _razorpay = null;
const getRazorpay = () => {
  if (_razorpay) return _razorpay;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret || keyId === 'rzp_test_your_key_id') {
    throw new Error(
      'Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file. ' +
      'Get test keys from: https://dashboard.razorpay.com/app/keys'
    );
  }

  const Razorpay = require('razorpay');
  _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _razorpay;
};

const PLANS = {
  bronze: {
    name: 'Bronze', amount: 9900, currency: 'INR', downloads: 5,
    features: ['5 downloads/day', 'HD streaming', 'No ads', 'Watch parties']
  },
  silver: {
    name: 'Silver', amount: 19900, currency: 'INR', downloads: 15,
    features: ['15 downloads/day', 'Full HD streaming', 'No ads', 'Watch parties', 'Priority support']
  },
  gold: {
    name: 'Gold', amount: 39900, currency: 'INR', downloads: 9999,
    features: ['Unlimited downloads', '4K streaming', 'No ads', 'Watch parties', 'Priority support', 'Early access']
  }
};

// Get plan details + Razorpay key for frontend
router.get('/plans', (req, res) => {
  res.json({
    plans: PLANS,
    key: process.env.RAZORPAY_KEY_ID || '',
    configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_KEY_ID !== 'rzp_test_your_key_id')
  });
});

// Create Razorpay order
router.post('/create-order', protect, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ message: 'Invalid plan selected' });

    const planDetails = PLANS[plan];
    const receipt = `rcpt_${req.user._id.toString().slice(-8)}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount: planDetails.amount,   // in paise
      currency: planDetails.currency,
      receipt,
      notes: { userId: req.user._id.toString(), plan, username: req.user.username }
    });

    await User.findByIdAndUpdate(req.user._id, { razorpayOrderId: order.id });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
      planDetails
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err.message || err);
    const msg = err.message?.includes('not configured')
      ? err.message
      : `Payment initiation failed: ${err.message || 'Razorpay error'}`;
    res.status(500).json({ message: msg });
  }
});

// Verify payment and upgrade plan
router.post('/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment details' });
    }

    // Verify signature using HMAC SHA256
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(500).json({ message: 'Razorpay secret not configured' });

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment signature verification failed. Please contact support.' });
    }

    if (!PLANS[plan]) return res.status(400).json({ message: 'Invalid plan' });

    // Update user plan — expires 1 month from now
    const planExpiry = new Date();
    planExpiry.setMonth(planExpiry.getMonth() + 1);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { plan, planExpiry, $unset: { razorpayOrderId: '' } },
      { new: true }
    );

    // Send invoice email (non-blocking — don't fail payment if email fails)
    const amount = PLANS[plan].amount / 100;
    sendInvoiceEmail(user, plan, amount, razorpay_payment_id).catch(e =>
      console.error('Invoice email failed:', e.message)
    );

    res.json({
      message: `Successfully upgraded to ${PLANS[plan].name} plan!`,
      plan,
      planExpiry,
      user: {
        id: user._id, username: user.username, email: user.email,
        plan: user.plan, planExpiry: user.planExpiry
      }
    });
  } catch (err) {
    console.error('Payment verify error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get current subscription info
router.get('/my-plan', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('plan planExpiry downloadHistory dailyDownloadCount lastDownloadDate');

    const planDetails = PLANS[user.plan] || {
      name: 'Free', downloads: 1,
      features: ['1 download/day', 'SD streaming', 'Basic features']
    };

    const { allowed, remaining } = user.canDownload();

    res.json({
      plan: user.plan,
      planDetails,
      planExpiry: user.planExpiry,
      downloadHistory: user.downloadHistory,
      canDownload: allowed,
      downloadsRemaining: remaining
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
