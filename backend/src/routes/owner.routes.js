const express = require('express');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getRestaurantIdForUser, listRestaurantFeatures } = require('../utils/featureAccess');
const { writeAuditLog } = require('../utils/auditLog');

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

router.get('/financial-dashboard', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const range = String(req.query.range || '30d');
  const rangeStartSql = {
    today: "date_trunc('day', CURRENT_TIMESTAMP)",
    '7d': "CURRENT_TIMESTAMP - INTERVAL '7 days'",
    '30d': "CURRENT_TIMESTAMP - INTERVAL '30 days'",
    month: "date_trunc('month', CURRENT_TIMESTAMP)",
  }[range] || "CURRENT_TIMESTAMP - INTERVAL '30 days'";

  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
       COUNT(*) FILTER (WHERE payment_status <> 'paid')::int AS unpaid_orders,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS gross_sales,
       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND payment_method IN ('cash', 'cod')), 0)::numeric AS cash_sales,
       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND payment_method IN ('online', 'upi', 'cashfree')), 0)::numeric AS online_sales,
       COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS average_order_value
     FROM orders
     WHERE restaurant_id = $1 AND created_at >= ${rangeStartSql}`,
    [restaurantId]
  );

  const { rows: commissionRows } = await pool.query(
    `SELECT COALESCE(SUM(charge_amount), 0)::numeric AS platform_fees
     FROM chargeable_order_ledger
     WHERE restaurant_id = $1
       AND status = 'chargeable'
       AND created_at >= ${rangeStartSql}`,
    [restaurantId]
  ).catch(() => ({ rows: [{ platform_fees: 0 }] }));

  const metrics = rows[0] || {};
  const grossSales = Number(metrics.gross_sales || 0);
  const platformFees = Number(commissionRows[0]?.platform_fees || 0);

  return res.json({
    range: ['today', '7d', '30d', 'month'].includes(range) ? range : '30d',
    availableMetrics: [
      'gross_sales', 'paid_orders', 'unpaid_orders', 'cancelled_orders',
      'cash_sales', 'online_sales', 'platform_fees', 'restaurant_payable',
      'average_order_value',
    ],
    metrics: {
      grossSales,
      paidOrders: Number(metrics.paid_orders || 0),
      unpaidOrders: Number(metrics.unpaid_orders || 0),
      cancelledOrders: Number(metrics.cancelled_orders || 0),
      cashSales: Number(metrics.cash_sales || 0),
      onlineSales: Number(metrics.online_sales || 0),
      platformFees,
      restaurantPayable: Math.max(0, grossSales - platformFees),
      averageOrderValue: Number(metrics.average_order_value || 0),
    },
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

  const category = String(req.query.category || '').trim();
  const direction = String(req.query.direction || '').trim();
  const startDate = String(req.query.startDate || '').trim();
  const endDate = String(req.query.endDate || '').trim();
  const params = [restaurantId];
  const conditions = ['restaurant_id = $1'];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (direction === 'credit' || direction === 'debit') {
    params.push(direction);
    conditions.push(`direction = $${params.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    params.push(startDate);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    params.push(endDate);
    conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const { rows: entries } = await pool.query(
    `SELECT id, order_id, entry_type, category, direction, amount, currency,
            description, reference_id, reversed_entry_id, created_by_user_id, created_at
     FROM financial_ledger_entries
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  ).catch(() => ({ rows: [] }));

  const { rows: summary } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE direction = 'credit'), 0)::numeric AS total_credits,
       COALESCE(SUM(amount) FILTER (WHERE direction = 'debit'), 0)::numeric AS total_debits
     FROM financial_ledger_entries
     WHERE ${conditions.join(' AND ')}`,
    params
  ).catch(() => ({ rows: [{ total_credits: 0, total_debits: 0 }] }));

  const totalCredits = Number(summary[0]?.total_credits || 0);
  const totalDebits = Number(summary[0]?.total_debits || 0);
  return res.json({
    entries,
    summary: {
      totalCredits,
      totalDebits,
      closingBalance: totalCredits - totalDebits,
    },
  });
}));

router.post('/ledger', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });

  const entryType = String(req.body?.entryType || '').trim();
  const direction = String(req.body?.direction || '').trim();
  const category = String(req.body?.category || '').trim();
  const description = String(req.body?.description || '').trim();
  const referenceId = String(req.body?.referenceId || '').trim() || null;
  const amount = Number(req.body?.amount);
  const allowedTypes = new Set([
    'inventory_purchase', 'supplier_payment', 'staff_expense', 'rent',
    'utilities', 'packaging_cost', 'other_income', 'other_expense', 'adjustment',
  ]);

  if (!allowedTypes.has(entryType) || !['credit', 'debit'].includes(direction)) {
    return res.status(400).json({ message: 'Choose a valid ledger type and direction.' });
  }
  if (!category || !description || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Category, description, and a positive amount are required.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO financial_ledger_entries
       (restaurant_id, entry_type, category, direction, amount, description, reference_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, entry_type, category, direction, amount, description, reference_id, created_at`,
    [restaurantId, entryType, category, direction, amount.toFixed(2), description, referenceId, req.user.userId]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId,
    action: 'ledger_manual_entry_created',
    resourceType: 'financial_ledger_entry',
    resourceId: rows[0].id,
    metadata: { entryType, category, direction, amount, referenceId },
  });

  return res.status(201).json({ message: 'Ledger entry added', entry: rows[0] });
}));

router.post('/ledger/:entryId/reverse', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  if (!restaurantId) return res.status(404).json({ message: 'Restaurant not found' });
  const entryId = Number(req.params.entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ message: 'Invalid ledger entry.' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: sourceRows } = await conn.query(
      `SELECT id, entry_type, category, direction, amount, description, reference_id, reversed_entry_id
       FROM financial_ledger_entries
       WHERE id = $1 AND restaurant_id = $2
       FOR UPDATE`,
      [entryId, restaurantId]
    );
    if (!sourceRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Ledger entry not found.' });
    }
    if (sourceRows[0].reversed_entry_id) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ message: 'This ledger entry has already been reversed.' });
    }

    const source = sourceRows[0];
    const { rows: reversalRows } = await conn.query(
      `INSERT INTO financial_ledger_entries
         (restaurant_id, entry_type, category, direction, amount, description, reference_id, created_by_user_id)
       VALUES ($1, 'reversal', $2, $3, $4, $5, $6, $7)
       RETURNING id, entry_type, category, direction, amount, description, reference_id, created_at`,
      [
        restaurantId,
        source.category || 'correction',
        source.direction === 'credit' ? 'debit' : 'credit',
        source.amount,
        `Reversal of ledger entry #${source.id}: ${source.description || 'correction'}`,
        `reversal:${source.id}`,
        req.user.userId,
      ]
    );
    await conn.query(
      'UPDATE financial_ledger_entries SET reversed_entry_id = $1 WHERE id = $2',
      [reversalRows[0].id, source.id]
    );
    await conn.query('COMMIT');

    await writeAuditLog({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      restaurantId,
      action: 'ledger_entry_reversed',
      resourceType: 'financial_ledger_entry',
      resourceId: source.id,
      metadata: { reversalEntryId: reversalRows[0].id },
    });
    return res.status(201).json({ message: 'Ledger entry reversed', entry: reversalRows[0] });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
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
