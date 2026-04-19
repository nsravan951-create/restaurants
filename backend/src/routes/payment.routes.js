const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { endSessionByOrderId } = require('../utils/tableSession');

const router = express.Router();

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const err = new Error('Razorpay keys not configured');
    err.status = 500;
    throw err;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

router.post('/create-order', asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId is required' });

  const { rows: orderRows } = await pool.query('SELECT id, total_amount FROM orders WHERE id = $1', [orderId]);
  if (!orderRows.length) return res.status(404).json({ message: 'Order not found' });

  const razorpay = getRazorpay();
  const amountInPaise = Math.round(Number(orderRows[0].total_amount) * 100);

  const razorpayOrder = await razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `order_${orderId}`,
    notes: { internalOrderId: String(orderId) },
  });

  await pool.query('UPDATE orders SET razorpay_order_id = $1, payment_method = $2 WHERE id = $3', [razorpayOrder.id, 'online', orderId]);

  return res.json({
    message: 'Razorpay order created',
    razorpayOrder,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}));

router.post('/verify', asyncHandler(async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: 'Missing payment verification fields' });
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    await pool.query('UPDATE orders SET payment_status = $1 WHERE id = $2', ['failed', orderId]);
    return res.status(400).json({ message: 'Payment verification failed' });
  }

  await pool.query(
    'UPDATE orders SET payment_status = $1, razorpay_payment_id = $2 WHERE id = $3',
    ['paid', razorpay_payment_id, orderId]
  );

  await endSessionByOrderId(orderId, 'payment_completed');

  return res.json({ message: 'Payment verified successfully' });
}));

module.exports = router;
