const axios = require('axios');

const sendEmail = async ({ to, toName, subject, htmlContent, textContent }) => {
  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@videostream.com',
          name: process.env.BREVO_SENDER_NAME || 'VideoStream'
        },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent,
        textContent: textContent || ''
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true, data: response.data };
  } catch (err) {
    console.error('Email error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
};

const sendOTPEmail = async (user, otp) => {
  return sendEmail({
    to: user.email,
    toName: user.username,
    subject: 'VideoStream - Login Verification OTP',
    textContent: `VideoStream Security Verification\n\nHi ${user.username},\n\nWe detected a login from a new device or location. Your OTP code is: ${otp}\n\nThis code is valid for 10 minutes.\n\nIf you didn't attempt to login, please secure your account immediately.`,
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;background:#1a1a2e;color:#fff;border-radius:12px">
        <h2 style="color:#7c3aed;text-align:center">🎬 VideoStream</h2>
        <h3 style="text-align:center">Security Verification Required</h3>
        <p>We detected a login from a new device or location. Please verify your identity.</p>
        <div style="background:#2d2d4e;padding:20px;border-radius:8px;text-align:center;margin:20px 0">
          <p style="margin:0;font-size:14px;color:#aaa">Your OTP Code</p>
          <h1 style="color:#7c3aed;letter-spacing:10px;margin:10px 0">${otp}</h1>
          <p style="margin:0;font-size:12px;color:#aaa">Valid for 10 minutes</p>
        </div>
        <p style="color:#aaa;font-size:12px">If you didn't attempt to login, please secure your account immediately.</p>
      </div>
    `
  });
};

const sendInvoiceEmail = async (user, plan, amount, transactionId) => {
  const planNames = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  
  return sendEmail({
    to: user.email,
    toName: user.username,
    subject: `VideoStream - ${planNames[plan]} Plan Subscription Confirmed`,
    textContent: `VideoStream - Payment Successful!\n\nHi ${user.username},\n\nYour ${planNames[plan]} Plan subscription has been confirmed.\n\nInvoice Details:\n- Customer: ${user.username}\n- Email: ${user.email}\n- Plan: ${planNames[plan]} Plan\n- Amount: ₹${amount}\n- Transaction ID: ${transactionId}\n- Date: ${date}\n\nThank you for subscribing to VideoStream!`,
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;background:#1a1a2e;color:#fff;border-radius:12px">
        <h2 style="color:#7c3aed;text-align:center">🎬 VideoStream</h2>
        <div style="background:#10b981;padding:15px;border-radius:8px;text-align:center;margin:20px 0">
          <h3 style="margin:0">✅ Payment Successful!</h3>
        </div>
        <h3 style="color:#7c3aed">Invoice Details</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px;border-bottom:1px solid #333;color:#aaa">Customer</td><td style="padding:10px;border-bottom:1px solid #333">${user.username}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;color:#aaa">Email</td><td style="padding:10px;border-bottom:1px solid #333">${user.email}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;color:#aaa">Plan</td><td style="padding:10px;border-bottom:1px solid #333;color:#7c3aed"><strong>${planNames[plan]} Plan</strong></td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;color:#aaa">Amount</td><td style="padding:10px;border-bottom:1px solid #333"><strong>₹${amount}</strong></td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;color:#aaa">Transaction ID</td><td style="padding:10px;border-bottom:1px solid #333;font-size:12px">${transactionId}</td></tr>
          <tr><td style="padding:10px;color:#aaa">Date</td><td style="padding:10px">${date}</td></tr>
        </table>
        <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px">Thank you for subscribing to VideoStream!</p>
      </div>
    `
  });
};

module.exports = { sendEmail, sendOTPEmail, sendInvoiceEmail };
