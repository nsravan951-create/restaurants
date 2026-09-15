const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getRestaurantIdForUser } = require('../utils/featureAccess');
const { writeAuditLog } = require('../utils/auditLog');

const router = express.Router();

router.get('/plans', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, description, billing_interval, price, currency
     FROM plans WHERE is_active = TRUE ORDER BY price ASC`
  );
  return res.json({ plans: rows });
}));

router.get('/me', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows } = await pool.query(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, s.next_billing_date, s.amount, s.currency,
            p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN plans p ON p.id = s.plan_id
     WHERE s.restaurant_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [restaurantId]
  );

  return res.json({ subscription: rows[0] || null });
}));

router.post('/activate', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    planCode: z.string().min(2),
    months: z.number().int().positive().default(1),
  });
  const data = schema.parse({
    restaurantId: Number(req.body.restaurantId),
    planCode: req.body.planCode,
    months: Number(req.body.months || 1),
  });

  const { rows: planRows } = await pool.query(
    'SELECT id, code, price FROM plans WHERE code = $1 AND is_active = TRUE LIMIT 1',
    [data.planCode]
  );
  if (!planRows.length) return res.status(404).json({ message: 'Plan not found' });

  const plan = planRows[0];
  const { rows } = await pool.query(
    `INSERT INTO subscriptions
       (restaurant_id, plan_id, status, starts_at, ends_at, next_billing_date, amount, currency, provider)
     VALUES ($1, $2, 'active', NOW(), NOW() + ($3::int || ' months')::interval, NOW() + ($3::int || ' months')::interval, $4, 'INR', 'admin')
     RETURNING id, status, starts_at, ends_at`,
    [data.restaurantId, plan.id, data.months, plan.price]
  );

  await pool.query(
    `UPDATE restaurants
     SET subscription_plan = $1, subscription_status = 'active', subscription_expires_at = NOW() + ($2::int || ' months')::interval
     WHERE id = $3`,
    [plan.code, data.months, data.restaurantId]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: data.restaurantId,
    action: 'subscription_activated',
    resourceType: 'subscription',
    resourceId: rows[0].id,
    metadata: { planCode: plan.code, months: data.months },
  });

  return res.status(201).json({ message: 'Subscription activated', subscription: rows[0] });
}));

module.exports = router;
