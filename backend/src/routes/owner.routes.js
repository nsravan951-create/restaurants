const express = require('express');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getRestaurantIdForUser, listRestaurantFeatures } = require('../utils/featureAccess');

const router = express.Router();

const OWNER_DASHBOARD_SECTIONS = [
  'dashboard', 'kitchen', 'ready', 'tables', 'menu', 'invoices',
  'analytics', 'reviews', 'inventory', 'offers', 'coupons', 'customers', 'loyalty',
  'advanced-analytics', 'gst', 'password', 'features',
];

function normalizeDashboardLayout(sections) {
  const valid = new Set(OWNER_DASHBOARD_SECTIONS);
  const seen = new Set();
  const ordered = [];
  for (const section of sections || []) {
    const key = String(section || '').trim();
    if (valid.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  for (const section of OWNER_DASHBOARD_SECTIONS) {
    if (!seen.has(section)) ordered.push(section);
  }
  return ordered;
}

router.get('/dashboard-layout', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  let rows = [{ dashboard_layout: null }];
  try {
    const result = await pool.query(
      'SELECT dashboard_layout FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    rows = result.rows;
  } catch (error) {
    if (error.code !== '42703') throw error;
  }

  const layout = normalizeDashboardLayout(rows[0]?.dashboard_layout);
  return res.json({ restaurantId, sections: layout, availableSections: OWNER_DASHBOARD_SECTIONS });
}));

router.patch('/dashboard-layout', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const layout = normalizeDashboardLayout(req.body?.sections);
  try {
    await pool.query(
      'UPDATE restaurants SET dashboard_layout = $1::jsonb WHERE id = $2',
      [JSON.stringify(layout), restaurantId]
    );
  } catch (error) {
    if (error.code === '42703') {
      return res.status(503).json({ message: 'Dashboard layout requires migration 013_restaurant_hub_features.sql' });
    }
    throw error;
  }

  return res.json({ message: 'Dashboard layout saved', sections: layout });
}));

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

router.get('/gst-settings', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows } = await pool.query(
    `SELECT id, name, legal_name, gstin, business_address, address, state_name, state_code,
            default_gst_rate, invoice_prefix, fssai_license, thank_you_message
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  return res.json({ settings: rows[0] || null });
}));

router.patch('/gst-settings', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const body = req.body || {};
  await pool.query(
    `UPDATE restaurants SET
       legal_name = COALESCE($1, legal_name),
       gstin = COALESCE($2, gstin),
       business_address = COALESCE($3, business_address),
       state_name = COALESCE($4, state_name),
       state_code = COALESCE($5, state_code),
       default_gst_rate = COALESCE($6, default_gst_rate),
       invoice_prefix = COALESCE($7, invoice_prefix),
       fssai_license = COALESCE($8, fssai_license),
       thank_you_message = COALESCE($9, thank_you_message)
     WHERE id = $10`,
    [
      body.legalName || null,
      body.gstin || null,
      body.businessAddress || null,
      body.stateName || null,
      body.stateCode || null,
      body.defaultGstRate != null ? Number(body.defaultGstRate) : null,
      body.invoicePrefix || null,
      body.fssaiLicense || null,
      body.thankYouMessage || null,
      restaurantId,
    ]
  );

  const { rows } = await pool.query(
    `SELECT id, name, legal_name, gstin, business_address, address, state_name, state_code,
            default_gst_rate, invoice_prefix, fssai_license, thank_you_message
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  return res.json({ message: 'GST settings updated', settings: rows[0] });
}));

module.exports = router;
