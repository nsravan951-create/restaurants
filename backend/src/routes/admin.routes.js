const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { writeAuditLog } = require('../utils/auditLog');
const { requirePlatformPermission, requirePlatformAccess } = require('../middleware/platformPermissions');

const router = express.Router();

router.use(requireAuth());
router.use(requirePlatformAccess());

async function fetchDashboardSummary() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM restaurants) AS "totalRestaurants",
      (SELECT COUNT(*)::int FROM restaurants WHERE is_active = TRUE) AS "activeRestaurants",
      (SELECT COUNT(*)::int FROM orders) AS "totalOrders",
      (SELECT COUNT(*)::int FROM orders WHERE status IN ('pending', 'preparing', 'ready')) AS "activeOrders",
      (SELECT COUNT(*)::int FROM restaurant_tables WHERE availability_status = 'active') AS "activeTables",
      (SELECT COUNT(*)::int FROM ads) AS "totalAds",
      (SELECT COUNT(*)::int FROM ads WHERE is_active = TRUE) AS "activeAds",
      (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('day', now())) AS "todayRevenue",
      (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('month', now())) AS "monthlyRevenue",
      (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE payment_status = 'paid') AS "totalRevenue",
      (SELECT COALESCE(SUM(impressions), 0)::int FROM ads) AS "totalImpressions",
      (SELECT COALESCE(SUM(clicks), 0)::int FROM ads) AS "totalClicks"
  `);

  return rows[0] || {};
}

async function fetchRestaurantAnalytics() {
  const { rows } = await pool.query(`
    WITH order_stats AS (
      SELECT
        restaurant_id,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS monthly_orders,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_orders,
        COALESCE(SUM(total_amount), 0)::numeric AS total_revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::numeric AS monthly_revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::numeric AS today_revenue
      FROM orders
      WHERE payment_status = 'paid'
      GROUP BY restaurant_id
    ),
    table_stats AS (
      SELECT
        restaurant_id,
        COUNT(*)::int AS total_tables,
        COUNT(*) FILTER (WHERE availability_status = 'active')::int AS active_tables
      FROM restaurant_tables
      GROUP BY restaurant_id
    ),
    ad_stats AS (
      SELECT
        restaurant_id,
        COUNT(*)::int AS total_ads,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_ads,
        COALESCE(SUM(impressions), 0)::int AS impressions,
        COALESCE(SUM(clicks), 0)::int AS clicks
      FROM ads
      WHERE restaurant_id IS NOT NULL
      GROUP BY restaurant_id
    )
    SELECT
      r.id,
      r.name,
      r.slug,
      r.phone,
      r.address,
      r.is_active,
      r.subscription_plan,
      r.subscription_status,
      r.subscription_expires_at,
      u.name AS owner_name,
      u.email AS owner_email,
      COALESCE(os.total_orders, 0) AS total_orders,
      COALESCE(os.monthly_orders, 0) AS monthly_orders,
      COALESCE(os.today_orders, 0) AS today_orders,
      COALESCE(os.total_revenue, 0) AS total_revenue,
      COALESCE(os.monthly_revenue, 0) AS monthly_revenue,
      COALESCE(os.today_revenue, 0) AS today_revenue,
      COALESCE(ts.total_tables, 0) AS total_tables,
      COALESCE(ts.active_tables, 0) AS active_tables,
      COALESCE(ad.total_ads, 0) AS total_ads,
      COALESCE(ad.active_ads, 0) AS active_ads,
      COALESCE(ad.impressions, 0) AS impressions,
      COALESCE(ad.clicks, 0) AS clicks
    FROM restaurants r
    LEFT JOIN users u ON u.id = r.owner_user_id
    LEFT JOIN order_stats os ON os.restaurant_id = r.id
    LEFT JOIN table_stats ts ON ts.restaurant_id = r.id
    LEFT JOIN ad_stats ad ON ad.restaurant_id = r.id
    ORDER BY COALESCE(os.monthly_revenue, 0) DESC, r.name ASC
  `);

  return rows;
}

async function fetchAdsOverview() {
  const { rows } = await pool.query(`
    SELECT
      a.id,
      a.title,
      a.image_url AS "imageUrl",
      a.target_link AS "targetLink",
      a.restaurant_id AS "restaurantId",
      COALESCE(r.name, 'Global') AS "restaurantName",
      a.is_active AS "isActive",
      a.starts_at AS "startsAt",
      a.ends_at AS "endsAt",
      a.impressions,
      a.clicks,
      a.created_at AS "createdAt",
      CASE
        WHEN a.impressions > 0 THEN ROUND((a.clicks::numeric / a.impressions) * 100, 2)
        ELSE 0
      END AS ctr
    FROM ads a
    LEFT JOIN restaurants r ON r.id = a.restaurant_id
    ORDER BY a.id DESC
  `);

  return rows;
}

async function fetchRevenueSeries() {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(day, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(o.total_amount), 0)::numeric AS revenue
    FROM generate_series(
      date_trunc('day', now()) - interval '13 days',
      date_trunc('day', now()),
      interval '1 day'
    ) AS day
    LEFT JOIN orders o
      ON o.payment_status = 'paid'
     AND o.created_at >= day
     AND o.created_at < day + interval '1 day'
    GROUP BY day
    ORDER BY day
  `);

  return rows;
}

// GET /api/admin/stats
router.get('/stats', requirePlatformPermission('analytics.read'), asyncHandler(async (req, res) => {
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

  const { rows: onlinePaymentsRows } = await pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE (payment_provider='cashfree' OR payment_method='online') AND payment_status='paid'");
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

// GET /api/admin/dashboard
router.get('/dashboard', requirePlatformPermission('analytics.read'), asyncHandler(async (req, res) => {
  const [summary, restaurants, ads, revenueSeries, orders] = await Promise.all([
    fetchDashboardSummary(),
    fetchRestaurantAnalytics(),
    fetchAdsOverview(),
    fetchRevenueSeries(),
    pool.query(`
      SELECT o.id, o.restaurant_id, o.table_number, o.total_amount, o.status, o.payment_status,
             r.name AS restaurant_name, r.is_active
      FROM orders o
      LEFT JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.status IN ('pending', 'preparing', 'ready')
      ORDER BY o.created_at DESC
      LIMIT 20
    `),
  ]);

  return res.json({
    summary,
    restaurants,
    ads,
    revenueSeries,
    topRestaurants: restaurants.slice(0, 5),
    orders: orders.rows || [],
  });
}));

// GET /api/admin/restaurants
router.get('/restaurants', requirePlatformPermission('restaurants.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.address, r.is_active, r.subscription_plan, r.subscription_status, r.subscription_expires_at, u.name AS owner_name, u.email AS owner_email
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     ORDER BY r.id DESC`
  );
  return res.json({ restaurants: rows });
}));

router.get('/plans', requirePlatformPermission('subscriptions.view'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.billing_interval, p.price, p.currency, p.is_active,
            COALESCE(json_agg(json_build_object('featureKey', f.feature_key, 'name', f.name))
              FILTER (WHERE f.id IS NOT NULL), '[]'::json) AS features
     FROM plans p
     LEFT JOIN plan_features pf ON pf.plan_id = p.id
     LEFT JOIN features f ON f.id = pf.feature_id
     GROUP BY p.id
     ORDER BY p.price ASC, p.id ASC`
  );
  return res.json({ plans: rows });
}));

router.get('/commission-rules', requirePlatformPermission('finance.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cr.*, r.name AS restaurant_name
     FROM commission_rules cr
     LEFT JOIN restaurants r ON r.id = cr.restaurant_id
     ORDER BY cr.status DESC, cr.effective_from DESC, cr.id DESC`
  );
  return res.json({ rules: rows });
}));

router.post('/commission-rules', requirePlatformPermission('finance.write'), asyncHandler(async (req, res) => {
  const restaurantId = req.body?.restaurantId ? Number(req.body.restaurantId) : null;
  const commissionType = String(req.body?.commissionType || '').trim();
  const commissionValue = Number(req.body?.commissionValue);
  const effectiveFrom = req.body?.effectiveFrom || new Date().toISOString();
  if (!['percentage', 'fixed_per_order', 'subscription'].includes(commissionType)
    || !Number.isFinite(commissionValue) || commissionValue < 0) {
    return res.status(400).json({ message: 'Invalid commission rule' });
  }

  const { rows } = await pool.query(
    `INSERT INTO commission_rules (restaurant_id, commission_type, commission_value, effective_from)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [restaurantId, commissionType, commissionValue, effectiveFrom]
  );
  return res.status(201).json({ rule: rows[0] });
}));

router.post('/plans', requirePlatformPermission('subscriptions.manage'), asyncHandler(async (req, res) => {
  const code = String(req.body?.code || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const interval = String(req.body?.billingInterval || 'monthly').trim();
  const price = Number(req.body?.price || 0);
  const featureKeys = Array.isArray(req.body?.featureKeys) ? req.body.featureKeys : [];

  if (!/^[a-z0-9_-]{2,80}$/.test(code) || name.length < 2 || !['monthly', 'yearly', 'one_time'].includes(interval) || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: 'Invalid plan data' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO plans (code, name, description, billing_interval, price, currency)
       VALUES ($1, $2, $3, $4, $5, 'INR') RETURNING id, code, name, billing_interval, price`,
      [code, name, String(req.body?.description || '').trim() || null, interval, price]
    );
    for (const featureKey of featureKeys) {
      await client.query(
        `INSERT INTO plan_features (plan_id, feature_id)
         SELECT $1, id FROM features WHERE feature_key = $2
         ON CONFLICT DO NOTHING`,
        [rows[0].id, String(featureKey)]
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ plan: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/restaurants/:restaurantId/features/:featureKey', requirePlatformPermission('features.manage'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const featureKey = String(req.params.featureKey || '').trim();
  const enabled = req.body?.enabled !== false;
  if (!Number.isInteger(restaurantId) || restaurantId <= 0 || !featureKey) {
    return res.status(400).json({ message: 'Invalid restaurant or feature' });
  }

  const { rows } = await pool.query(
    `INSERT INTO restaurant_features (restaurant_id, feature_id, enabled, source)
     SELECT $1, id, $3, 'admin' FROM features WHERE feature_key = $2
     ON CONFLICT (restaurant_id, feature_id)
     DO UPDATE SET enabled = EXCLUDED.enabled, source = 'admin', updated_at = CURRENT_TIMESTAMP
     RETURNING restaurant_id, feature_id, enabled`,
    [restaurantId, featureKey, enabled]
  );
  if (!rows.length) return res.status(404).json({ message: 'Feature not found' });
  return res.json({ feature: rows[0] });
}));

// POST /api/admin/restaurants/:id/subscribe
router.post('/restaurants/:restaurantId/subscribe', requirePlatformPermission('subscriptions.manage'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { plan = 'Basic', months = 1 } = req.body || {};

  await pool.query(
    `UPDATE restaurants
     SET subscription_plan = $1, subscription_status = 'active', subscription_expires_at = (now() + ($2::int || ' months')::interval)
     WHERE id = $3`,
    [plan, Number(months), restaurantId]
  );

  const { rows } = await pool.query('SELECT id, name, subscription_plan, subscription_status, subscription_expires_at FROM restaurants WHERE id = $1 LIMIT 1', [restaurantId]);
  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: Number(restaurantId),
    action: 'subscription_activate',
    resourceType: 'restaurant',
    resourceId: restaurantId,
    metadata: { plan, months: Number(months) },
    ipAddress: req.ip,
  });
  return res.json({ restaurant: rows[0] || null });
}));

// POST /api/admin/restaurants/:id/unsubscribe
router.post('/restaurants/:restaurantId/unsubscribe', requirePlatformPermission('subscriptions.manage'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  await pool.query(
    `UPDATE restaurants
     SET subscription_status = 'inactive', subscription_expires_at = now()
     WHERE id = $1`,
    [restaurantId]
  );

  const { rows } = await pool.query('SELECT id, name, subscription_plan, subscription_status, subscription_expires_at FROM restaurants WHERE id = $1 LIMIT 1', [restaurantId]);
  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: Number(restaurantId),
    action: 'subscription_deactivate',
    resourceType: 'restaurant',
    resourceId: restaurantId,
    ipAddress: req.ip,
  });
  return res.json({ restaurant: rows[0] || null });
}));

// toggle active
router.patch('/restaurants/:restaurantId/toggle', requirePlatformPermission('restaurants.suspend'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await pool.query('UPDATE restaurants SET is_active = NOT is_active WHERE id = $1', [restaurantId]);
  return res.json({ message: 'Restaurant status toggled' });
}));

// Summaries
router.get('/summary', requirePlatformPermission('analytics.read'), asyncHandler(async (req, res) => {
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

router.get('/saas-profits', requirePlatformPermission('finance.read'), asyncHandler(async (req, res) => {
  const { rows: onlineRows } = await pool.query(`
    SELECT
      COALESCE(SUM(total_amount), 0)::numeric AS revenue,
      COUNT(*)::int AS order_count
    FROM orders
    WHERE payment_status = 'paid' AND created_at >= date_trunc('month', now())
  `);

  const { rows: platformRows } = await pool.query(`
    SELECT
      COALESCE(SUM(total_amount), 0)::numeric AS gross_revenue,
      COALESCE(SUM(net_amount), 0)::numeric AS net_revenue,
      COALESCE(SUM(commission_amount), 0)::numeric AS commission,
      COUNT(*)::int AS order_count
    FROM platform_orders
    WHERE created_at >= date_trunc('month', now())
  `);

  const { rows: offlineRows } = await pool.query(`
    SELECT
      COALESCE(SUM(total_amount), 0)::numeric AS revenue,
      COUNT(*)::int AS order_count
    FROM orders
    WHERE payment_status = 'paid'
      AND payment_method IN ('cash', 'cod')
      AND created_at >= date_trunc('month', now())
  `);

  const { rows: subscriptionRows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active_subscriptions,
      COUNT(*) FILTER (WHERE subscription_plan = 'Premium')::int AS premium_count,
      COUNT(*) FILTER (WHERE subscription_plan = 'Basic')::int AS basic_count
    FROM restaurants
  `);

  const online = onlineRows[0] || {};
  const platform = platformRows[0] || {};
  const offline = offlineRows[0] || {};
  const subs = subscriptionRows[0] || {};

  const onlineRevenue = Number(online.revenue || 0);
  const platformGross = Number(platform.gross_revenue || 0);
  const platformNet = Number(platform.net_revenue || 0);
  const offlineRevenue = Number(offline.revenue || 0);

  return res.json({
    monthly: {
      onlineRevenue,
      onlineOrders: Number(online.order_count || 0),
      platformGross,
      platformNet,
      platformCommission: Number(platform.commission || 0),
      platformOrders: Number(platform.order_count || 0),
      offlineRevenue,
      offlineOrders: Number(offline.order_count || 0),
      totalProfit: onlineRevenue + platformNet,
      dineInRevenue: onlineRevenue - offlineRevenue,
    },
    subscriptions: subs,
    channelBreakdown: [
      { channel: 'Dine-in (QR)', revenue: onlineRevenue - offlineRevenue, type: 'online' },
      { channel: 'Cash/COD', revenue: offlineRevenue, type: 'offline' },
      { channel: 'Swiggy/Zomato', revenue: platformGross, type: 'aggregator' },
    ],
  });
}));

router.get('/restaurants/:restaurantId/payment-details', requirePlatformPermission('bank_details.view'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, name, upi_vpa, bank_account_name, bank_name, phone, address
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Restaurant not found' });
  return res.json({ restaurant: rows[0] });
}));

router.patch('/restaurants/:restaurantId/payment-details', requirePlatformPermission('bank_details.manage'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { upiVpa, bankAccountName, bankName, phone, address } = req.body || {};

  await pool.query(
    `UPDATE restaurants
     SET upi_vpa = $1,
         bank_account_name = $2,
         bank_name = $3,
         phone = $4,
         address = $5
     WHERE id = $6`,
    [
      String(upiVpa || '').trim() || null,
      String(bankAccountName || '').trim() || null,
      String(bankName || '').trim() || null,
      String(phone || '').trim() || null,
      String(address || '').trim() || null,
      restaurantId,
    ]
  );

  const { rows } = await pool.query(
    `SELECT id, name, upi_vpa, bank_account_name, bank_name, phone, address
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  return res.json({ restaurant: rows[0] || null });
}));

router.get('/audit-logs', requirePlatformPermission('audit.read'), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const action = String(req.query.action || '').trim();
  const params = [limit];
  let filter = '';
  if (action) {
    filter = 'WHERE action = $2';
    params.push(action);
  }

  const { rows } = await pool.query(
    `SELECT id, actor_user_id, actor_role, restaurant_id, action, resource_type,
            resource_id, metadata, ip_address, created_at
     FROM audit_logs
     ${filter}
     ORDER BY created_at DESC
     LIMIT $1`,
    params
  ).catch((error) => {
    if (error.code === '42P01') return { rows: [] };
    throw error;
  });

  return res.json({ logs: rows });
}));

module.exports = router;
