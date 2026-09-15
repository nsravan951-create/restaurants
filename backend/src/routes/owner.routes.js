const express = require('express');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getRestaurantIdForUser, listRestaurantFeatures } = require('../utils/featureAccess');

const router = express.Router();

router.get('/entitlements', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });
  const features = await listRestaurantFeatures(restaurantId);
  return res.json({ restaurantId, features });
}));

router.get('/analytics', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  let restaurantId = req.user.role === 'super_admin' ? Number(req.query.restaurantId || 0) : 0;

  if (req.user.role === 'owner') {
    const { rows: ownedRows } = await pool.query(
      'SELECT id FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
      [req.user.userId]
    );
    restaurantId = Number(ownedRows[0]?.id || 0);
  }

  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurantId is required' });
  }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
       COUNT(*)::int AS total_orders,
       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS revenue,
       COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS avg_order_value,
       COUNT(*) FILTER (WHERE payment_status = 'paid' AND created_at >= date_trunc('day', now()))::int AS today_orders,
       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND created_at >= date_trunc('day', now())), 0)::numeric AS today_revenue
     FROM orders WHERE restaurant_id = $1`,
    [restaurantId]
  );

  const { rows: popular } = await pool.query(
    `SELECT oi.item_name, SUM(oi.quantity)::int AS qty
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     WHERE o.restaurant_id = $1 AND o.payment_status = 'paid'
     GROUP BY oi.item_name
     ORDER BY qty DESC
     LIMIT 5`,
    [restaurantId]
  );

  return res.json({
    restaurantId,
    summary: rows[0],
    popularItems: popular,
  });
}));

router.get('/orders', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  let restaurantId = req.user.role === 'super_admin' ? Number(req.query.restaurantId || 0) : 0;

  if (req.user.role === 'owner') {
    const { rows: ownedRows } = await pool.query(
      'SELECT id FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
      [req.user.userId]
    );
    restaurantId = Number(ownedRows[0]?.id || 0);
  }

  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  const { rows: orders } = await pool.query(
    `SELECT id, table_number, customer_name, total_amount, status, payment_status, created_at
     FROM orders
     WHERE restaurant_id = $1
     ORDER BY created_at DESC`,
    [restaurantId]
  );

  const { rows: revenueRows } = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS revenue
     FROM orders
     WHERE restaurant_id = $1 AND payment_status = 'paid'`,
    [restaurantId]
  );

  const { rows: sessionRows } = await pool.query(
    `SELECT id, table_id, status, started_at, ended_at, ended_reason
     FROM table_sessions
     WHERE restaurant_id = $1
     ORDER BY started_at DESC
     LIMIT 100`,
    [restaurantId]
  );

  return res.json({
    orders,
    revenue: Number(revenueRows[0]?.revenue || 0),
    sessions: sessionRows,
  });
}));

module.exports = router;
