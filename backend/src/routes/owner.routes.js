const express = require('express');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getRestaurantIdForUser, listRestaurantFeatures } = require('../utils/featureAccess');

const router = express.Router();

const OWNER_DASHBOARD_SECTIONS = [
  'dashboard', 'kitchen', 'ready', 'tables', 'menu', 'invoices', 'finance',
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

// --- OWNER NOTIFICATION CENTER ---
router.get('/notifications', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows: notifications } = await pool.query(
    `SELECT m.id, m.title, m.content, m.message_type, m.priority, m.created_at,
            COALESCE(mr.is_read, FALSE) AS is_read, mr.read_at
     FROM admin_messages m
     INNER JOIN message_recipients mr ON mr.message_id = m.id
     WHERE mr.restaurant_id = $1
       AND (m.expires_at IS NULL OR m.expires_at >= NOW())
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  const { rows: unreadCountRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM message_recipients mr
     INNER JOIN admin_messages m ON m.id = mr.message_id
     WHERE mr.restaurant_id = $1
       AND mr.is_read = FALSE
       AND (m.expires_at IS NULL OR m.expires_at >= NOW())`,
    [restaurantId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  return res.json({
    notifications,
    unreadCount: unreadCountRows[0]?.count || 0,
  });
}));

router.patch('/notifications/:id/read', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const messageId = Number(req.params.id);
  await pool.query(
    `UPDATE message_recipients
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE message_id = $1 AND restaurant_id = $2`,
    [messageId, restaurantId]
  ).catch(() => null);

  return res.json({ success: true, message: 'Notification marked as read' });
}));

router.patch('/notifications/read-all', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  await pool.query(
    `UPDATE message_recipients
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE restaurant_id = $1 AND is_read = FALSE`,
    [restaurantId]
  ).catch(() => null);

  return res.json({ success: true, message: 'All notifications marked as read' });
}));

// --- OWNER FINANCIAL LEDGER & SETTLEMENTS ---
router.get('/financial-overview', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  // 1. Get gross sales, order count, and today's sales
  const { rows: salesRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_orders,
       COALESCE(SUM(total_amount), 0)::numeric AS gross_sales,
       COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::numeric AS today_sales
     FROM orders
     WHERE restaurant_id = $1 AND payment_status = 'paid'`,
    [restaurantId]
  );

  // 2. Get commission charged
  const { rows: commRows } = await pool.query(
    `SELECT COALESCE(SUM(charge_amount), 0)::numeric AS total_commission
     FROM chargeable_order_ledger
     WHERE restaurant_id = $1`,
    [restaurantId]
  ).catch(() => ({ rows: [{ total_commission: 0 }] }));

  // 3. Get latest settlement
  const { rows: settlementRows } = await pool.query(
    `SELECT status, settlement_reference, settled_at, net_payable, created_at
     FROM settlements
     WHERE restaurant_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  const grossSales = Number(salesRows[0]?.gross_sales || 0);
  const commission = Number(commRows[0]?.total_commission || 0);
  const restaurantPayable = Math.max(0, grossSales - commission);
  const latestSettlement = settlementRows[0] || null;

  return res.json({
    grossSales,
    totalCommission: commission,
    restaurantPayable,
    totalOrders: salesRows[0]?.total_orders || 0,
    todaySales: Number(salesRows[0]?.today_sales || 0),
    latestSettlement,
  });
}));

router.get('/settlements', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows: settlements } = await pool.query(
    `SELECT id, period_start, period_end, gross_amount, commission_amount,
            refund_amount, adjustment_amount, net_payable, status,
            settlement_reference, settled_at, notes, created_at
     FROM settlements
     WHERE restaurant_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  return res.json({ settlements });
}));

router.get('/ledger', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows: entries } = await pool.query(
    `SELECT id, order_id, entry_type, amount, currency, description, created_at
     FROM financial_ledger_entries
     WHERE restaurant_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  return res.json({ entries });
}));

// --- RESEND DAILY SETTLEMENT LEDGER PREVIEW & DISPATCH ---
const { generateLedgerEmailHtml, sendLedgerEmail } = require('../services/emailLedger');

router.get('/daily-ledger-preview', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows: restRows } = await pool.query(
    `SELECT r.name, u.name AS owner_name, u.email
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.id = $1 LIMIT 1`,
    [restaurantId]
  );

  const { rows: salesRows } = await pool.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::numeric AS gross
     FROM orders
     WHERE restaurant_id = $1 AND payment_status = 'paid'`,
    [restaurantId]
  );

  const { rows: commRows } = await pool.query(
    `SELECT COALESCE(SUM(charge_amount), 0)::numeric AS comm
     FROM chargeable_order_ledger
     WHERE restaurant_id = $1`,
    [restaurantId]
  ).catch(() => ({ rows: [{ comm: 0 }] }));

  const gross = Number(salesRows[0]?.gross || 0);
  const commission = Number(commRows[0]?.comm || 0);
  const payable = Math.max(0, gross - commission);

  const html = generateLedgerEmailHtml({
    restaurantName: restRows[0]?.name || 'Restaurant',
    ownerName: restRows[0]?.owner_name || 'Owner',
    dateFormatted: new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }),
    totalOrders: salesRows[0]?.orders || 0,
    grossSales: gross,
    refunds: 0,
    commission,
    restaurantPayable: payable,
    settlementStatus: 'pending',
  });

  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
}));

router.post('/send-daily-ledger', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const { rows: restRows } = await pool.query(
    `SELECT r.name, u.name AS owner_name, u.email
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.id = $1 LIMIT 1`,
    [restaurantId]
  );

  const targetEmail = req.body?.email || restRows[0]?.email;
  if (!targetEmail) return res.status(400).json({ message: 'Recipient email required' });

  const { rows: salesRows } = await pool.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::numeric AS gross
     FROM orders
     WHERE restaurant_id = $1 AND payment_status = 'paid'`,
    [restaurantId]
  );

  const { rows: commRows } = await pool.query(
    `SELECT COALESCE(SUM(charge_amount), 0)::numeric AS comm
     FROM chargeable_order_ledger
     WHERE restaurant_id = $1`,
    [restaurantId]
  ).catch(() => ({ rows: [{ comm: 0 }] }));

  const gross = Number(salesRows[0]?.gross || 0);
  const commission = Number(commRows[0]?.comm || 0);
  const payable = Math.max(0, gross - commission);

  const result = await sendLedgerEmail({
    to: targetEmail,
    restaurantName: restRows[0]?.name || 'Restaurant',
    ownerName: restRows[0]?.owner_name || 'Owner',
    dateFormatted: new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }),
    totalOrders: salesRows[0]?.orders || 0,
    grossSales: gross,
    refunds: 0,
    commission,
    restaurantPayable: payable,
    settlementStatus: 'pending',
  });

  return res.json(result);
}));

module.exports = router;
