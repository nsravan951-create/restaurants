const express = require('express');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const {
  getCashfreeConfig,
  createCashfreePaymentOrder,
  verifyCashfreeWebhookSignature,
  buildCashfreeReturnUrl,
  createPaymentReference,
} = require('../services/cashfree');

const router = express.Router();

router.post('/cashfree/create-order', asyncHandler(async (req, res) => {
  const orderId = Number(req.body?.orderId || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  const { rows } = await pool.query(
    `SELECT id, total_amount, payment_status, payment_provider
     FROM orders WHERE id = $1 LIMIT 1`,
    [orderId]
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
    returnUrl: buildCashfreeReturnUrl(orderId),
    reference,
  });

  await pool.query(
    `INSERT INTO payment_transactions
       (order_id, payment_provider, provider_order_id, amount, currency, status, provider_payload)
     VALUES ($1, 'cashfree', $2, $3, 'INR', 'pending', $4::jsonb)
     ON CONFLICT (order_id) DO UPDATE SET
       provider_order_id = EXCLUDED.provider_order_id,
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       status = 'pending',
       provider_payload = EXCLUDED.provider_payload,
       updated_at = CURRENT_TIMESTAMP`,
    [orderId, providerOrder.id, amount, JSON.stringify(providerOrder)]
  );

  return res.status(201).json({
    message: 'Cashfree payment order created',
    orderId,
    amount,
    currency: 'INR',
    paymentSessionId: providerOrder.paymentSessionId,
    checkoutUrl: providerOrder.checkoutUrl,
  });
}));

router.post('/cashfree/webhook', asyncHandler(async (req, res) => {
  verifyCashfreeWebhookSignature(req);
  return res.json({ message: 'Cashfree webhook accepted' });
}));

router.get('/cashfree/return', asyncHandler(async (req, res) => {
  const orderId = Number(req.query.orderId || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  const { rows } = await pool.query(
    `SELECT id, payment_status, payment_provider
     FROM orders WHERE id = $1 LIMIT 1`,
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

router.post('/cashfree/verify', asyncHandler(async (req, res) => {
  return res.status(501).json({
    message: 'Cashfree server-side verification will be connected using the official SDK/API details.',
    code: 'CASHFREE_VERIFICATION_NOT_CONFIGURED',
  });
}));

module.exports = router;
