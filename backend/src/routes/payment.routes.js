const express = require('express');

const pool = require('../config/db');
const { paymentLimiter, webhookLimiter } = require('../middleware/rateLimit');
const asyncHandler = require('../utils/asyncHandler');
const {
  getCashfreeConfig,
  getCashfreePublicConfig,
  createCashfreePaymentOrder,
  verifyCashfreeWebhookSignature,
  fetchCashfreePaymentOrder,
  buildCashfreeReturnUrl,
  createPaymentReference,
} = require('../services/cashfree');
const {
  completeOnlinePayment,
  markOnlinePaymentFailed,
} = require('../utils/paymentCompletion');
const { upsertCashfreeTransaction } = require('../utils/paymentTransaction');

const router = express.Router();

router.get('/cashfree/config', asyncHandler(async (req, res) => {
  const config = getCashfreePublicConfig();
  if (!config.configured) {
    return res.status(503).json({
      configured: false,
      mode: config.mode,
      message: 'Cashfree is not configured on the server',
      code: 'CASHFREE_NOT_CONFIGURED',
    });
  }
  return res.json(config);
}));

router.post('/cashfree/create-order', paymentLimiter, asyncHandler(async (req, res) => {
  const orderId = Number(req.body?.orderId || 0);
  const sessionToken = String(req.body?.sessionToken || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'orderId is required' });
  }
  if (sessionToken.length < 10) {
    return res.status(400).json({ message: 'sessionToken is required' });
  }

  const { rows } = await pool.query(
    `SELECT o.id, o.restaurant_id, o.table_id, o.total_amount, o.payment_status, o.payment_provider
     FROM orders o
     INNER JOIN table_sessions s ON s.id = o.table_session_id
     WHERE o.id = $1 AND s.session_token = $2
     LIMIT 1`,
    [orderId, sessionToken]
  );
  if (!rows.length) return res.status(404).json({ message: 'Order not found' });

  const order = rows[0];
  if (order.payment_provider !== 'cashfree' || order.payment_status !== 'pending') {
    return res.status(409).json({ message: 'Order is not eligible for Cashfree payment' });
  }

  const existing = await pool.query(
    `SELECT provider_order_id, status, amount, currency
     FROM payment_transactions
     WHERE order_id = $1 AND payment_provider = 'cashfree'
     LIMIT 1`,
    [orderId]
  );
  if (existing.rows.length && ['created', 'pending'].includes(existing.rows[0].status)) {
    return res.status(409).json({
      message: 'A Cashfree payment attempt already exists. Retry the existing checkout or wait for its result.',
      payment: existing.rows[0],
    });
  }

  const config = getCashfreeConfig();
  if (!config.configured) {
    return res.status(503).json({
      message: 'Cashfree is not configured. No payment was created.',
      code: 'CASHFREE_NOT_CONFIGURED',
    });
  }

  const amount = Number(order.total_amount);
  const reference = createPaymentReference(orderId);
  const providerOrder = await createCashfreePaymentOrder({
    orderId,
    amount,
    currency: 'INR',
    customer: {
      id: `order_${orderId}`,
      phone: String(req.body?.customerPhone || '').trim() || undefined,
    },
    returnUrl: buildCashfreeReturnUrl(orderId, order.table_id),
    reference,
  });

  await upsertCashfreeTransaction(pool, {
    orderId,
    restaurantId: order.restaurant_id,
    providerOrderId: providerOrder.id,
    amount,
    providerPayload: providerOrder.raw,
  });

  return res.status(201).json({
    message: 'Cashfree payment order created',
    orderId,
    amount,
    currency: 'INR',
    mode: config.environment === 'production' ? 'production' : 'sandbox',
    paymentSessionId: providerOrder.paymentSessionId,
    checkoutUrl: providerOrder.checkoutUrl,
  });
}));

router.post('/cashfree/webhook', webhookLimiter, asyncHandler(async (req, res) => {
  const payload = verifyCashfreeWebhookSignature(req);
  const eventId = String(req.headers['x-webhook-id'] || `${payload?.type || 'unknown'}:${payload?.data?.payment?.cf_payment_id || payload?.data?.order?.order_id || 'unknown'}`);
  const eventInsert = await pool.query(
    `INSERT INTO payment_webhook_events (provider, event_id, provider_order_id, payload)
     VALUES ('cashfree', $1, $2, $3::jsonb)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [eventId, payload?.data?.order?.order_id || null, JSON.stringify(payload)]
  );
  if (!eventInsert.rows.length) return res.json({ message: 'Cashfree webhook already processed' });

  const providerOrderId = payload?.data?.order?.order_id || payload?.data?.order?.cf_order_id;
  const providerPaymentId = payload?.data?.payment?.cf_payment_id || null;
  const providerStatus = String(payload?.data?.payment?.payment_status || payload?.type || '').toUpperCase();
  const paymentStatus = ['SUCCESS', 'PAID', 'PAYMENT_SUCCESS_WEBHOOK'].includes(providerStatus) ? 'paid'
    : ['FAILED', 'CANCELLED', 'USER_DROPPED', 'PAYMENT_FAILED_WEBHOOK'].includes(providerStatus) ? 'failed' : null;

  if (!providerOrderId || !paymentStatus) {
    return res.status(202).json({ message: 'Cashfree webhook ignored', status: providerStatus || 'unknown' });
  }

  const { rows: transactionRows } = await pool.query(
    `SELECT pt.order_id, pt.amount, o.payment_status, o.restaurant_id, o.table_id
     FROM payment_transactions pt
     INNER JOIN orders o ON o.id = pt.order_id
     WHERE pt.provider_order_id = $1 AND pt.payment_provider = 'cashfree'
     LIMIT 1`,
    [providerOrderId]
  );
  if (!transactionRows.length) return res.status(404).json({ message: 'Cashfree order not found' });

  const transaction = transactionRows[0];
  const receivedAmount = Number(payload?.data?.payment?.payment_amount || payload?.data?.order?.order_amount || transaction.amount);
  if (paymentStatus === 'paid' && receivedAmount !== Number(transaction.amount)) {
    return res.status(409).json({ message: 'Cashfree payment amount mismatch' });
  }

  if (paymentStatus === 'paid') {
    await completeOnlinePayment(transaction.order_id, {
      provider: 'cashfree',
      providerPaymentId,
      providerPayload: payload,
    });
  } else {
    await markOnlinePaymentFailed(transaction.order_id, 'cashfree', payload);
  }

  return res.json({ message: 'Cashfree webhook processed' });
}));

router.get('/cashfree/status/:orderId', paymentLimiter, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId || 0);
  const sessionToken = String(req.query.sessionToken || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0 || sessionToken.length < 10) {
    return res.status(400).json({ message: 'orderId and sessionToken are required' });
  }
  const { rows } = await pool.query(
    `SELECT o.id, o.payment_status, o.payment_provider, o.restaurant_id, o.table_id, pt.provider_order_id
     FROM orders o
     INNER JOIN table_sessions s ON s.id = o.table_session_id AND s.session_token = $2
     LEFT JOIN payment_transactions pt ON pt.order_id = o.id AND pt.payment_provider = 'cashfree'
     WHERE o.id = $1 LIMIT 1`,
    [orderId, sessionToken]
  );
  if (!rows.length) return res.status(404).json({ message: 'Order not found' });

  const providerStatus = rows[0].provider_order_id
    ? await fetchCashfreePaymentOrder(rows[0].provider_order_id)
    : null;

  if (providerStatus?.order_status === 'PAID' && rows[0].payment_status !== 'paid') {
    await completeOnlinePayment(orderId, {
      provider: 'cashfree',
      providerPayload: providerStatus,
    });
  }

  const { rows: latest } = await pool.query(
    'SELECT payment_status FROM orders WHERE id = $1 LIMIT 1',
    [orderId]
  );

  return res.json({
    orderId,
    paymentStatus: latest[0]?.payment_status || rows[0].payment_status,
    providerStatus,
  });
}));

router.get('/cashfree/return', asyncHandler(async (req, res) => {
  const orderId = Number(req.query.orderId || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  const { rows } = await pool.query(
    `SELECT id, payment_status, payment_provider FROM orders WHERE id = $1 LIMIT 1`,
    [orderId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Order not found' });

  return res.json({
    orderId,
    paymentStatus: rows[0].payment_status,
    paymentProvider: rows[0].payment_provider,
    message: rows[0].payment_status === 'paid'
      ? 'Payment verified'
      : 'Payment is still being verified. Do not retry until the payment status is confirmed.',
  });
}));

router.post('/cashfree/verify', paymentLimiter, asyncHandler(async (req, res) => {
  const orderId = Number(req.body?.orderId || 0);
  const sessionToken = String(req.body?.sessionToken || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0 || sessionToken.length < 10) {
    return res.status(400).json({ message: 'orderId and sessionToken are required' });
  }

  const { rows } = await pool.query(
    `SELECT o.id, o.payment_status, pt.provider_order_id, pt.amount
     FROM orders o
     INNER JOIN table_sessions s ON s.id = o.table_session_id AND s.session_token = $2
     INNER JOIN payment_transactions pt ON pt.order_id = o.id AND pt.payment_provider = 'cashfree'
     WHERE o.id = $1 LIMIT 1`,
    [orderId, sessionToken]
  );
  if (!rows.length) return res.status(404).json({ message: 'Payment order not found' });

  const providerStatus = await fetchCashfreePaymentOrder(rows[0].provider_order_id);
  if (providerStatus?.order_status === 'PAID' && rows[0].payment_status !== 'paid') {
    await completeOnlinePayment(orderId, {
      provider: 'cashfree',
      providerPayload: providerStatus,
    });
  }

  const { rows: latest } = await pool.query(
    'SELECT payment_status FROM orders WHERE id = $1 LIMIT 1',
    [orderId]
  );

  return res.json({
    orderId,
    paymentStatus: latest[0]?.payment_status,
    providerOrderId: rows[0].provider_order_id,
    providerStatus,
  });
}));

module.exports = router;
