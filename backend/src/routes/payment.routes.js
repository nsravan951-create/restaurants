const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { endSessionByOrderId } = require('../utils/tableSession');
const { emitOrderUpdate, emitTableUpdate } = require('../services/socket');
const { buildInvoiceModel, renderInvoiceHtml } = require('../utils/invoice');

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


router.post('/upi/confirm', asyncHandler(async (req, res) => {
  const { orderId, txnRef } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId is required' });

  // mark order as paid (note: in production, verify UPI transaction server-side)
  await pool.query('UPDATE orders SET payment_status = $1 WHERE id = $2', ['paid', orderId]);

  await endSessionByOrderId(orderId, 'payment_completed');

  // fetch order, restaurant and items to render invoice
  const { rows: orderRows } = await pool.query('SELECT id, restaurant_id, table_number, customer_name, total_amount, status, payment_method, payment_status, created_at FROM orders WHERE id = $1 LIMIT 1', [orderId]);
  if (!orderRows.length) return res.status(404).json({ message: 'Order not found' });

  const { rows: restaurantRows } = await pool.query('SELECT id, name FROM restaurants WHERE id = $1 LIMIT 1', [orderRows[0].restaurant_id]);

  const { rows: itemRows } = await pool.query(
    `SELECT item_name, item_price, quantity, line_total
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  // emit realtime notifications
  try {
    emitOrderUpdate(orderRows[0].restaurant_id, { type: 'paid', orderId: Number(orderId) });
    emitTableUpdate(orderRows[0].restaurant_id, { tableId: orderRows[0].table_number, status: 'paid' });
  } catch (e) {}

  const model = buildInvoiceModel(orderRows[0], restaurantRows[0], itemRows);
  return res.send(renderInvoiceHtml(model));
}));


// Webhook endpoint for UPI payment providers (or merchant service) to notify server of payments
router.post('/upi/webhook', asyncHandler(async (req, res) => {
  const secret = process.env.UPI_WEBHOOK_SECRET || '';
  const incoming = req.headers['x-upi-signature'] || req.body.signature || '';

  if (!secret || incoming !== secret) {
    return res.status(403).json({ message: 'Invalid webhook signature' });
  }

  const { orderId, txnRef, status } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId required' });

  if (String(status).toLowerCase() !== 'success') {
    await pool.query('UPDATE orders SET payment_status = $1 WHERE id = $2', ['failed', orderId]);
    return res.json({ message: 'marked failed' });
  }

  await pool.query('UPDATE orders SET payment_status = $1, upi_txn_ref = $2 WHERE id = $3', ['paid', txnRef || null, orderId]);
  await endSessionByOrderId(orderId, 'payment_completed');

  // emit realtime update
  const { rows: orderRows2 } = await pool.query('SELECT restaurant_id FROM orders WHERE id = $1 LIMIT 1', [orderId]);
  if (orderRows2.length) {
    try {
      emitOrderUpdate(orderRows2[0].restaurant_id, { type: 'paid', orderId: Number(orderId) });
      emitTableUpdate(orderRows2[0].restaurant_id, { tableId: orderRows2[0].table_id, status: 'paid' });
    } catch (e) {}
  }

  return res.json({ message: 'ok' });
}));


// Simple reconcile/check endpoint for owner/admin to verify order payment status
router.get('/upi/reconcile', asyncHandler(async (req, res) => {
  const orderId = Number(req.query.orderId || 0);
  if (!orderId) return res.status(400).json({ message: 'orderId required' });

  const { rows } = await pool.query('SELECT id, payment_status, upi_txn_ref FROM orders WHERE id = $1 LIMIT 1', [orderId]);
  if (!rows.length) return res.status(404).json({ message: 'Order not found' });

  // In real integration, call PSP to verify txnRef; here we return DB status for manual reconciliation
  return res.json({ orderId: rows[0].id, payment_status: rows[0].payment_status, upi_txn_ref: rows[0].upi_txn_ref });
}));

module.exports = router;
