const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');
const { writeAuditLog } = require('../utils/auditLog');

const router = express.Router();

const refundRequestSchema = z.object({
  orderId: z.number().int().positive(),
  amount: z.number().positive(),
  reason: z.string().max(255).optional().default(''),
});

router.post('/request', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const data = refundRequestSchema.parse({
    ...req.body,
    orderId: Number(req.body.orderId),
    amount: Number(req.body.amount),
  });

  const { rows: orderRows } = await pool.query(
    `SELECT id, restaurant_id, payment_status, total_amount
     FROM orders WHERE id = $1 LIMIT 1`,
    [data.orderId]
  );
  if (!orderRows.length) return res.status(404).json({ message: 'Order not found' });
  await ensureRestaurantAccess(req.user, orderRows[0].restaurant_id);

  if (orderRows[0].payment_status !== 'paid') {
    return res.status(409).json({ message: 'Only paid orders can be refunded' });
  }
  if (data.amount > Number(orderRows[0].total_amount)) {
    return res.status(400).json({ message: 'Refund amount exceeds order total' });
  }

  const { rows: ptRows } = await pool.query(
    `SELECT id FROM payment_transactions WHERE order_id = $1 LIMIT 1`,
    [data.orderId]
  );

  const { rows } = await pool.query(
    `INSERT INTO refund_requests
       (restaurant_id, order_id, payment_transaction_id, amount, reason, requested_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status`,
    [
      orderRows[0].restaurant_id,
      data.orderId,
      ptRows[0]?.id || null,
      data.amount,
      data.reason,
      req.user.userId,
    ]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: orderRows[0].restaurant_id,
    action: 'refund_requested',
    resourceType: 'order',
    resourceId: data.orderId,
    metadata: { amount: data.amount, reason: data.reason },
  });

  return res.status(201).json({ message: 'Refund requested', refund: rows[0] });
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, order_id, amount, reason, status, created_at, updated_at
     FROM refund_requests WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [restaurantId]
  );
  return res.json({ refunds: rows });
}));

router.patch('/:refundId/approve', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const refundId = Number(req.params.refundId);
  const { rows } = await pool.query(
    `UPDATE refund_requests
     SET status = 'approved', approved_by_user_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND status = 'requested'
     RETURNING id, restaurant_id, order_id, amount`,
    [req.user.userId, refundId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Refund request not found or not pending' });

  await pool.query(
    `INSERT INTO financial_ledger_entries (restaurant_id, order_id, entry_type, amount, description)
     VALUES ($1, $2, 'refund', $3, 'Refund approved (pending provider settlement)')`,
    [rows[0].restaurant_id, rows[0].order_id, rows[0].amount]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: rows[0].restaurant_id,
    action: 'refund_approved',
    resourceType: 'refund_request',
    resourceId: refundId,
    metadata: { orderId: rows[0].order_id, amount: rows[0].amount },
  });

  return res.json({ message: 'Refund approved', refund: rows[0] });
}));

module.exports = router;
