const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Require super_admin for all admin routes
router.use(requireAuth(['super_admin']));

// GET /api/admin/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = {};
  const { rows: restaurantsRows } = await pool.query('SELECT COUNT(*)::int AS total FROM restaurants');
  stats.totalRestaurants = restaurantsRows[0] ? restaurantsRows[0].total : 0;

  const { rows: activeOrdersRows } = await pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE status IN ('pending','preparing','ready')");
  stats.activeOrders = activeOrdersRows[0] ? activeOrdersRows[0].total : 0;

  const { rows: activeTablesRows } = await pool.query("SELECT COUNT(*)::int AS total FROM restaurant_tables WHERE availability_status = 'active'");
  stats.activeTables = activeTablesRows[0] ? activeTablesRows[0].total : 0;

  const { rows: revenueTodayRows } = await pool.query("SELECT COALESCE(SUM(total_amount)::numeric,0) AS total FROM orders WHERE created_at >= date_trunc('day', now()) AND payment_status='paid'");
  stats.revenueToday = Number(revenueTodayRows[0]?.total || 0);

  const { rows: monthlyRevenueRows } = await pool.query("SELECT COALESCE(SUM(total_amount)::numeric,0) AS total FROM orders WHERE created_at >= date_trunc('month', now()) AND payment_status='paid'");
  stats.monthlyRevenue = Number(monthlyRevenueRows[0]?.total || 0);

  const { rows: pendingPaymentsRows } = await pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE payment_status='pending'");
  stats.pendingPayments = pendingPaymentsRows[0] ? pendingPaymentsRows[0].total : 0;

  const { rows: onlinePaymentsRows } = await pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE payment_method='online' AND payment_status='paid'");
  stats.onlinePayments = onlinePaymentsRows[0] ? onlinePaymentsRows[0].total : 0;

  const { rows: cashOrdersRows } = await pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE payment_method='cod'");
  stats.cashOrders = cashOrdersRows[0] ? cashOrdersRows[0].total : 0;

  const { rows: todayCustomersRows } = await pool.query("SELECT COUNT(DISTINCT customer_name)::int AS total FROM orders WHERE created_at >= date_trunc('day', now())");
  stats.todaysCustomers = todayCustomersRows[0] ? todayCustomersRows[0].total : 0;

  const { rows: topRows } = await pool.query("SELECT r.id, r.name, COALESCE(SUM(o.total_amount),0) AS revenue FROM restaurants r LEFT JOIN orders o ON o.restaurant_id = r.id AND o.payment_status='paid' AND o.created_at >= date_trunc('month', now()) GROUP BY r.id ORDER BY revenue DESC LIMIT 1");
  stats.topRestaurant = topRows[0] ? { id: topRows[0].id, name: topRows[0].name, revenue: Number(topRows[0].revenue) } : null;

  const { rows: peakRows } = await pool.query("SELECT date_part('hour', created_at)::int AS hr, COUNT(*)::int AS cnt FROM orders WHERE created_at >= (now() - interval '7 days') GROUP BY hr ORDER BY cnt DESC LIMIT 3");
  stats.peakHours = peakRows.map(r => ({ hour: r.hr, count: r.cnt }));

  const { rows: promoRows } = await pool.query("SELECT COUNT(*)::int AS total FROM ads WHERE is_active = TRUE");
  stats.activePromotions = promoRows[0] ? promoRows[0].total : 0;

  return res.json(stats);
}));

// GET /api/admin/restaurants
router.get('/restaurants', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.address, r.is_active, r.subscription_plan, r.subscription_status, r.subscription_expires_at, u.name AS owner_name, u.email AS owner_email
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     ORDER BY r.id DESC`
  );
  return res.json({ restaurants: rows });
}));

// POST /api/admin/restaurants/:id/subscribe
router.post('/restaurants/:restaurantId/subscribe', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { plan = 'Basic', months = 1 } = req.body || {};

  await pool.query(
    `ALTER TABLE IF NOT EXISTS restaurants ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(80);
     ALTER TABLE IF NOT EXISTS restaurants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(40);
     ALTER TABLE IF NOT EXISTS restaurants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;`
  );

  await pool.query(
    `UPDATE restaurants
     SET subscription_plan = $1, subscription_status = 'active', subscription_expires_at = (now() + ($2::int || ' months')::interval)
     WHERE id = $3`,
    [plan, Number(months), restaurantId]
  );

  const { rows } = await pool.query('SELECT id, name, subscription_plan, subscription_status, subscription_expires_at FROM restaurants WHERE id = $1 LIMIT 1', [restaurantId]);
  return res.json({ restaurant: rows[0] || null });
}));

// POST /api/admin/restaurants/:id/unsubscribe
router.post('/restaurants/:restaurantId/unsubscribe', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  await pool.query(
    `ALTER TABLE IF NOT EXISTS restaurants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(40);
     ALTER TABLE IF NOT EXISTS restaurants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;`
  );

  await pool.query(
    `UPDATE restaurants
     SET subscription_status = 'inactive', subscription_expires_at = now()
     WHERE id = $1`,
    [restaurantId]
  );

  const { rows } = await pool.query('SELECT id, name, subscription_plan, subscription_status, subscription_expires_at FROM restaurants WHERE id = $1 LIMIT 1', [restaurantId]);
  return res.json({ restaurant: rows[0] || null });
}));

// toggle active
router.patch('/restaurants/:restaurantId/toggle', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await pool.query('UPDATE restaurants SET is_active = NOT is_active WHERE id = $1', [restaurantId]);
  return res.json({ message: 'Restaurant status toggled' });
}));

// Summaries
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows: orderRows } = await pool.query('SELECT COUNT(*)::int AS "totalOrders" FROM orders');
  const { rows: restaurantRows } = await pool.query('SELECT COUNT(*)::int AS "totalRestaurants" FROM restaurants');
  const { rows: activeAdsRows } = await pool.query('SELECT COUNT(*)::int AS "totalActiveAds" FROM ads WHERE is_active = TRUE');
  const ordersRow = orderRows[0];
  const restaurantsRow = restaurantRows[0];
  const activeAdsRow = activeAdsRows[0];

  return res.json({
    totalOrders: ordersRow.totalOrders,
    totalRestaurants: restaurantsRow.totalRestaurants,
    totalActiveAds: activeAdsRow.totalActiveAds,
  });
}));

module.exports = router;
