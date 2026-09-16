const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const crypto = require('crypto');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission, requirePlatformAccess } = require('../middleware/platformPermissions');
const { writeAuditLog } = require('../utils/auditLog');
const { listUserPermissions, getAccessibleRestaurantIds, restaurantScopeClause } = require('../utils/rbac');
const { getCashfreePublicConfig } = require('../services/cashfree');
const { loadRestaurantFinancials } = require('../utils/restaurantHub');
const { listRestaurantFeatures } = require('../utils/featureAccess');

const router = express.Router();

router.use(requireAuth());
router.use(requirePlatformAccess());

function parseDateRange(query) {
  const preset = String(query.range || '30d').toLowerCase();
  const now = new Date();
  let start;
  let end = new Date(now);

  if (query.from && query.to) {
    start = new Date(query.from);
    end = new Date(query.to);
  } else if (preset === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'yesterday') {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setHours(23, 59, 59, 999);
  } else if (preset === '7d') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  }

  return { start, end, preset };
}

function maskAccount(last4) {
  return last4 ? `XXXX XXXX ${last4}` : '—';
}

router.get('/dashboard', requirePlatformPermission('analytics.read'), asyncHandler(async (req, res) => {
  const { start, end, preset } = parseDateRange(req.query);
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('r.id', accessible, 1);
  const params = [...scope.params, start, end];

  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM restaurants r WHERE 1=1 ${scope.clause}) AS total_restaurants,
       (SELECT COUNT(*)::int FROM restaurants r WHERE r.is_active = TRUE ${scope.clause}) AS active_restaurants,
       (SELECT COUNT(*)::int FROM restaurants r WHERE r.onboarding_status = 'suspended' ${scope.clause}) AS suspended_restaurants,
       (SELECT COUNT(*)::int FROM orders o
         INNER JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.created_at BETWEEN $${scope.nextIndex} AND $${scope.nextIndex + 1} ${scope.clause.replace(/r\.id/g, 'o.restaurant_id')}) AS period_orders,
       (SELECT COUNT(*)::int FROM orders o
         INNER JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.payment_status = 'paid' AND o.created_at >= date_trunc('day', now()) ${scope.clause.replace(/r\.id/g, 'o.restaurant_id')}) AS today_orders,
       (SELECT COALESCE(SUM(o.total_amount), 0)::numeric FROM orders o
         INNER JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.payment_status = 'paid' AND o.created_at BETWEEN $${scope.nextIndex} AND $${scope.nextIndex + 1} ${scope.clause.replace(/r\.id/g, 'o.restaurant_id')}) AS period_gmv,
       (SELECT COALESCE(SUM(o.total_amount), 0)::numeric FROM orders o
         INNER JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.payment_status = 'paid' AND o.created_at >= date_trunc('day', now()) ${scope.clause.replace(/r\.id/g, 'o.restaurant_id')}) AS today_gmv,
       (SELECT COALESCE(SUM(col.charge_amount), 0)::numeric FROM chargeable_order_ledger col
         INNER JOIN orders o ON o.id = col.order_id
         INNER JOIN restaurants r ON r.id = col.restaurant_id
         WHERE o.payment_status = 'paid' AND col.created_at BETWEEN $${scope.nextIndex} AND $${scope.nextIndex + 1} ${scope.clause.replace(/r\.id/g, 'col.restaurant_id')}) AS period_commission,
       (SELECT COUNT(*)::int FROM subscriptions s
         INNER JOIN restaurants r ON r.id = s.restaurant_id
         WHERE s.status = 'active' ${scope.clause.replace(/r\.id/g, 's.restaurant_id')}) AS active_subscriptions,
       (SELECT COUNT(*)::int FROM settlements s
         INNER JOIN restaurants r ON r.id = s.restaurant_id
         WHERE s.status = 'pending' ${scope.clause.replace(/r\.id/g, 's.restaurant_id')}) AS pending_settlements,
       (SELECT COUNT(*)::int FROM payment_transactions pt
         WHERE pt.status = 'paid' AND pt.created_at BETWEEN $${scope.nextIndex} AND $${scope.nextIndex + 1}) AS successful_payments,
       (SELECT COUNT(*)::int FROM payment_transactions pt
         WHERE pt.status = 'failed' AND pt.created_at BETWEEN $${scope.nextIndex} AND $${scope.nextIndex + 1}) AS failed_payments,
       (SELECT COUNT(*)::int FROM refund_requests rr WHERE rr.status IN ('requested', 'processing')) AS open_refunds,
       (SELECT COUNT(*)::int FROM users u WHERE u.role NOT IN ('owner', 'kitchen', 'staff') AND u.is_active = TRUE) AS active_team_members`,
    params
  ).catch((error) => {
    if (['42P01', '42703'].includes(error.code)) {
      return pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM restaurants) AS total_restaurants,
           (SELECT COUNT(*)::int FROM restaurants WHERE is_active = TRUE) AS active_restaurants,
           0::int AS suspended_restaurants,
           (SELECT COUNT(*)::int FROM orders WHERE created_at BETWEEN $1 AND $2) AS period_orders,
           (SELECT COUNT(*)::int FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('day', now())) AS today_orders,
           (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE payment_status = 'paid' AND created_at BETWEEN $1 AND $2) AS period_gmv,
           (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('day', now())) AS today_gmv,
           0::numeric AS period_commission,
           0::int AS active_subscriptions,
           0::int AS pending_settlements,
           0::int AS successful_payments,
           0::int AS failed_payments,
           0::int AS open_refunds,
           0::int AS active_team_members`,
        [start, end]
      );
    }
    throw error;
  });

  const { rows: revenueSeries } = await pool.query(
    `SELECT date_trunc('day', o.created_at)::date AS day,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS revenue,
            COUNT(*)::int AS orders
     FROM orders o
     WHERE o.created_at BETWEEN $1 AND $2
     GROUP BY 1 ORDER BY 1 ASC`,
    [start, end]
  );

  return res.json({
    range: preset,
    start,
    end,
    metrics: rows[0],
    revenueSeries,
  });
}));

router.get('/search', requirePlatformPermission('search.global'), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('r.id', accessible, 2);
  const pattern = `%${q}%`;

  const restaurants = await pool.query(
    `SELECT r.id, r.name, u.email AS owner_email, 'restaurant' AS type
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE (r.name ILIKE $1 OR u.email ILIKE $1 OR CAST(r.id AS TEXT) = $2) ${scope.clause}
     LIMIT 10`,
    [pattern, q, ...scope.params]
  );

  const orders = await pool.query(
    `SELECT o.id, o.restaurant_id, r.name AS restaurant_name, 'order' AS type
     FROM orders o INNER JOIN restaurants r ON r.id = o.restaurant_id
     WHERE CAST(o.id AS TEXT) = $2 ${scope.clause.replace(/r\.id/g, 'o.restaurant_id')}
     LIMIT 5`,
    [pattern, q, ...scope.params]
  ).catch(() => ({ rows: [] }));

  return res.json({
    results: [...restaurants.rows, ...orders.rows],
  });
}));

router.get('/system/health', requirePlatformPermission('system.health'), asyncHandler(async (req, res) => {
  let database = 'connected';
  try {
    await pool.query('SELECT 1');
  } catch (_) {
    database = 'error';
  }

  let migrations = [];
  try {
    const { rows } = await pool.query('SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 10');
    migrations = rows;
  } catch (_) {
    migrations = [];
  }

  let cashfree = { status: 'unknown' };
  try {
    const cfg = getCashfreePublicConfig();
    cashfree = { status: cfg.configured ? 'connected' : 'configuration_required', mode: cfg.mode || null };
  } catch (_) {
    cashfree = { status: 'error' };
  }

  return res.json({
    backend: 'ok',
    database,
    cashfree,
    socketIo: 'available',
    migrations,
    timestamp: new Date().toISOString(),
  });
}));

// --- Departments ---
router.get('/departments', requirePlatformPermission('team.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, description, status, created_at FROM departments ORDER BY name ASC'
  ).catch(() => ({ rows: [] }));
  return res.json({ departments: rows });
}));

router.post('/departments', requirePlatformPermission('roles.manage'), asyncHandler(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name is required' });
  const { rows } = await pool.query(
    `INSERT INTO departments (name, description) VALUES ($1, $2)
     RETURNING id, name, description, status`,
    [String(name).trim(), description || null]
  );
  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'department_created',
    resourceType: 'department',
    resourceId: rows[0].id,
    ipAddress: req.ip,
  });
  return res.status(201).json({ department: rows[0] });
}));

// --- Roles ---
router.get('/roles', requirePlatformPermission('roles.view'), asyncHandler(async (req, res) => {
  const { rows: roles } = await pool.query(
    `SELECT pr.id, pr.role_key, pr.name, pr.description, pr.status, pr.is_system,
            d.name AS department_name,
            COALESCE(json_agg(prp.permission_key) FILTER (WHERE prp.permission_key IS NOT NULL), '[]') AS permissions
     FROM platform_roles pr
     LEFT JOIN departments d ON d.id = pr.department_id
     LEFT JOIN platform_role_permissions prp ON prp.role = pr.role_key
     GROUP BY pr.id, d.name
     ORDER BY pr.name ASC`
  ).catch(async () => {
    const { rows: permissions } = await pool.query('SELECT permission_key, name, category FROM platform_permissions ORDER BY permission_key');
    const { rows: mappings } = await pool.query('SELECT role, permission_key FROM platform_role_permissions');
    return { rows: [], permissions, mappings };
  });

  const { rows: permissions } = await pool.query(
    'SELECT permission_key, name, description, category FROM platform_permissions ORDER BY category, permission_key'
  );
  return res.json({ roles, permissions });
}));

const createRoleSchema = z.object({
  roleKey: z.string().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(2),
  description: z.string().optional().default(''),
  departmentId: z.number().int().positive().optional().nullable(),
  permissions: z.array(z.string()).default([]),
});

router.post('/roles', requirePlatformPermission('roles.manage'), asyncHandler(async (req, res) => {
  const data = createRoleSchema.parse({
    ...req.body,
    roleKey: String(req.body.roleKey || '').trim().toLowerCase().replace(/\s+/g, '_'),
    departmentId: req.body.departmentId ? Number(req.body.departmentId) : null,
  });

  const { rows } = await pool.query(
    `INSERT INTO platform_roles (role_key, name, description, department_id, is_system, status)
     VALUES ($1, $2, $3, $4, FALSE, 'active')
     RETURNING id, role_key, name`,
    [data.roleKey, data.name, data.description, data.departmentId]
  );

  for (const key of data.permissions) {
    await pool.query(
      `INSERT INTO platform_role_permissions (role, permission_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [data.roleKey, key]
    );
  }

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'role_created',
    resourceType: 'role',
    resourceId: data.roleKey,
    metadata: { permissions: data.permissions },
    ipAddress: req.ip,
  });

  return res.status(201).json({ role: rows[0] });
}));

router.patch('/roles/:roleKey', requirePlatformPermission('roles.manage'), asyncHandler(async (req, res) => {
  const roleKey = String(req.params.roleKey);
  const { name, description, status, departmentId, permissions } = req.body || {};

  if (name || description || status || departmentId !== undefined) {
    await pool.query(
      `UPDATE platform_roles SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         department_id = COALESCE($4, department_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE role_key = $5`,
      [name || null, description || null, status || null, departmentId ?? null, roleKey]
    );
  }

  if (Array.isArray(permissions)) {
    await pool.query('DELETE FROM platform_role_permissions WHERE role = $1', [roleKey]);
    for (const key of permissions) {
      await pool.query(
        'INSERT INTO platform_role_permissions (role, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleKey, key]
      );
    }
  }

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'role_updated',
    resourceType: 'role',
    resourceId: roleKey,
    ipAddress: req.ip,
  });

  return res.json({ message: 'Role updated' });
}));

// --- Settlements ---
router.get('/settlements', requirePlatformPermission('settlements.view'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.query.restaurantId || 0);
  const status = String(req.query.status || '').trim();
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('s.restaurant_id', accessible, idx);
  if (scope.clause) {
    conditions.push(scope.clause.replace(' AND ', ''));
    params.push(...scope.params);
    idx = scope.nextIndex;
  }

  if (restaurantId > 0) {
    conditions.push(`s.restaurant_id = $${idx++}`);
    params.push(restaurantId);
  }
  if (status) {
    conditions.push(`s.status = $${idx++}`);
    params.push(status);
  }

  const { rows } = await pool.query(
    `SELECT s.*, r.name AS restaurant_name
     FROM settlements s
     INNER JOIN restaurants r ON r.id = s.restaurant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.created_at DESC
     LIMIT 200`,
    params
  ).catch(() => ({ rows: [] }));

  return res.json({ settlements: rows });
}));

router.post('/settlements', requirePlatformPermission('settlements.manage'), asyncHandler(async (req, res) => {
  const {
    restaurantId, periodStart, periodEnd, grossAmount, commissionAmount,
    refundAmount, adjustmentAmount, notes,
  } = req.body || {};

  const net = Number(grossAmount || 0) - Number(commissionAmount || 0)
    - Number(refundAmount || 0) + Number(adjustmentAmount || 0);

  const { rows } = await pool.query(
    `INSERT INTO settlements (
       restaurant_id, period_start, period_end, gross_amount, commission_amount,
       refund_amount, adjustment_amount, net_payable, status, notes, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
     RETURNING *`,
    [
      Number(restaurantId), periodStart, periodEnd,
      Number(grossAmount || 0), Number(commissionAmount || 0),
      Number(refundAmount || 0), Number(adjustmentAmount || 0),
      net, notes || null, req.user.userId,
    ]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: Number(restaurantId),
    action: 'settlement_created',
    resourceType: 'settlement',
    resourceId: rows[0].id,
    metadata: { net_payable: net },
    ipAddress: req.ip,
  });

  return res.status(201).json({ settlement: rows[0] });
}));

router.patch('/settlements/:id', requirePlatformPermission('settlements.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status, settlementReference, notes } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE settlements SET
       status = COALESCE($1, status),
       settlement_reference = COALESCE($2, settlement_reference),
       notes = COALESCE($3, notes),
       settled_at = CASE WHEN $1 = 'paid' THEN CURRENT_TIMESTAMP ELSE settled_at END,
       updated_by_user_id = $4,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [status || null, settlementReference || null, notes || null, req.user.userId, id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Settlement not found' });

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: rows[0].restaurant_id,
    action: 'settlement_updated',
    resourceType: 'settlement',
    resourceId: id,
    metadata: { status },
    ipAddress: req.ip,
  });

  return res.json({ settlement: rows[0] });
}));

// --- Bank accounts ---
router.get('/restaurants/:restaurantId/bank-accounts', requirePlatformPermission('bank_details.view'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const { rows } = await pool.query(
    `SELECT id, restaurant_id, account_holder_name, bank_name, account_number_last4,
            ifsc_code, upi_id, verification_status, is_primary, created_at, updated_at
     FROM restaurant_bank_accounts WHERE restaurant_id = $1 ORDER BY is_primary DESC, id DESC`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  return res.json({
    accounts: rows.map((row) => ({
      ...row,
      account_masked: maskAccount(row.account_number_last4),
    })),
  });
}));

router.post('/restaurants/:restaurantId/bank-accounts', requirePlatformPermission('bank_details.manage'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const {
    accountHolderName, bankName, accountNumber, ifscCode, upiId, isPrimary,
  } = req.body || {};

  const raw = String(accountNumber || '').replace(/\s/g, '');
  if (!accountHolderName || !bankName || raw.length < 4) {
    return res.status(400).json({ message: 'accountHolderName, bankName, and accountNumber are required' });
  }

  const last4 = raw.slice(-4);
  const encrypted = process.env.BANK_ENCRYPTION_KEY
    ? crypto.createHmac('sha256', process.env.BANK_ENCRYPTION_KEY).update(raw).digest('hex')
    : null;

  const { rows } = await pool.query(
    `INSERT INTO restaurant_bank_accounts (
       restaurant_id, account_holder_name, bank_name, account_number_last4,
       account_number_encrypted, ifsc_code, upi_id, is_primary, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE), $9)
     RETURNING id, account_holder_name, bank_name, account_number_last4, ifsc_code, upi_id, verification_status, is_primary`,
    [
      restaurantId, accountHolderName, bankName, last4, encrypted,
      ifscCode || null, upiId || null, isPrimary, req.user.userId,
    ]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId,
    action: 'bank_account_added',
    resourceType: 'bank_account',
    resourceId: rows[0].id,
    metadata: { last4 },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    account: { ...rows[0], account_masked: maskAccount(last4) },
  });
}));

// --- Activity ---
router.get('/activity', requirePlatformPermission('audit.read'), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const action = String(req.query.action || '').trim();
  const restaurantId = Number(req.query.restaurantId || 0);

  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (action) {
    conditions.push(`action ILIKE $${idx++}`);
    params.push(`%${action}%`);
  }
  if (restaurantId > 0) {
    conditions.push(`restaurant_id = $${idx++}`);
    params.push(restaurantId);
  }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT a.*, u.name AS actor_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT $${idx}`,
    params
  ).catch(() => ({ rows: [] }));

  const { rows: logins } = await pool.query(
    `SELECT la.*, u.name AS user_name FROM login_activity la
     LEFT JOIN users u ON u.id = la.user_id
     ORDER BY la.created_at DESC LIMIT 50`
  ).catch(() => ({ rows: [] }));

  return res.json({ auditLogs: rows, loginActivity: logins });
}));

router.get('/me/permissions', asyncHandler(async (req, res) => {
  const permissions = await listUserPermissions(req.user.userId, req.user.role);
  return res.json({ role: req.user.role, permissions });
}));

async function syncUpgradeActivations() {
  await pool.query(
    `INSERT INTO restaurant_upgrade_activations (
       restaurant_id, payment_transaction_id, amount, currency, provider_order_id, status
     )
     SELECT pt.restaurant_id, pt.id, pt.amount, COALESCE(pt.currency, 'INR'), pt.provider_order_id, 'pending'
     FROM payment_transactions pt
     WHERE pt.status = 'paid'
       AND pt.payment_purpose IN ('RESTAURANT_UPGRADE', 'RESTAURANT_SUBSCRIPTION')
       AND pt.restaurant_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM restaurant_upgrade_activations rua
         WHERE rua.payment_transaction_id = pt.id
       )`
  ).catch(() => {});
}

// --- Restaurant hub ---
router.get('/restaurants', requirePlatformPermission('restaurants.read'), asyncHandler(async (req, res) => {
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('r.id', accessible, 1);

  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.is_active, r.onboarding_status,
            r.gstin, r.subscription_plan, r.subscription_status, r.subscription_expires_at,
            r.upi_vpa, r.created_at,
            u.name AS owner_name, u.email AS owner_email,
            COALESCE((
              SELECT COUNT(*)::int FROM restaurant_features rf
              INNER JOIN features f ON f.id = rf.feature_id
              WHERE rf.restaurant_id = r.id AND rf.enabled = TRUE
            ), 0) AS enabled_features_count,
            COALESCE((
              SELECT COUNT(*)::int FROM payment_transactions pt
              WHERE pt.restaurant_id = r.id
                AND pt.payment_purpose IN ('RESTAURANT_UPGRADE', 'RESTAURANT_SUBSCRIPTION')
                AND pt.status = 'paid'
            ), 0) AS upgrade_payment_count,
            COALESCE((
              SELECT COUNT(*)::int FROM restaurant_upgrade_activations rua
              WHERE rua.restaurant_id = r.id AND rua.status = 'pending'
            ), 0) AS pending_upgrade_activations
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE 1=1 ${scope.clause}
     ORDER BY r.name ASC`,
    scope.params
  );

  return res.json({ restaurants: rows });
}));

router.get('/restaurants/:restaurantId/profile', requirePlatformPermission('restaurants.read'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const profile = await loadRestaurantFinancials(restaurantId);
  if (!profile) return res.status(404).json({ message: 'Restaurant not found' });
  return res.json(profile);
}));

router.get('/features/registry', requirePlatformPermission('features.view'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT feature_key, name, description, is_active
     FROM features WHERE is_active = TRUE ORDER BY name ASC`
  );
  return res.json({ features: rows });
}));

router.post('/restaurants/:restaurantId/features/:featureKey', requirePlatformPermission('features.manage'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const featureKey = String(req.params.featureKey || '').trim();
  const enabled = req.body?.enabled !== false;

  const { rows } = await pool.query(
    `INSERT INTO restaurant_features (restaurant_id, feature_id, enabled, source)
     SELECT $1, id, $3, 'admin' FROM features WHERE feature_key = $2
     ON CONFLICT (restaurant_id, feature_id)
     DO UPDATE SET enabled = EXCLUDED.enabled, source = 'admin', updated_at = CURRENT_TIMESTAMP
     RETURNING restaurant_id, feature_id, enabled`,
    [restaurantId, featureKey, enabled]
  );
  if (!rows.length) return res.status(404).json({ message: 'Feature not found' });

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId,
    action: enabled ? 'feature_enabled' : 'feature_disabled',
    resourceType: 'feature',
    resourceId: featureKey,
    metadata: { enabled },
    ipAddress: req.ip,
  });

  const features = await listRestaurantFeatures(restaurantId);
  return res.json({ feature: rows[0], features });
}));

router.patch('/restaurants/:restaurantId/financial', requirePlatformPermission('bank_details.manage'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
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
       phone = COALESCE($9, phone),
       address = COALESCE($10, address),
       upi_vpa = COALESCE($11, upi_vpa),
       bank_account_name = COALESCE($12, bank_account_name),
       bank_name = COALESCE($13, bank_name)
     WHERE id = $14`,
    [
      body.legalName || null,
      body.gstin || null,
      body.businessAddress || null,
      body.stateName || null,
      body.stateCode || null,
      body.defaultGstRate != null ? Number(body.defaultGstRate) : null,
      body.invoicePrefix || null,
      body.fssaiLicense || null,
      body.phone || null,
      body.address || null,
      body.upiVpa || null,
      body.accountHolderName || null,
      body.bankName || null,
      restaurantId,
    ]
  );

  const rawAccount = String(body.accountNumber || '').replace(/\s/g, '');
  if (rawAccount.length >= 4 && body.ifscCode) {
    const last4 = rawAccount.slice(-4);
    const encrypted = process.env.BANK_ENCRYPTION_KEY
      ? crypto.createHmac('sha256', process.env.BANK_ENCRYPTION_KEY).update(rawAccount).digest('hex')
      : null;

    await pool.query(
      `UPDATE restaurant_bank_accounts SET is_primary = FALSE WHERE restaurant_id = $1`,
      [restaurantId]
    ).catch(() => {});

    await pool.query(
      `INSERT INTO restaurant_bank_accounts (
         restaurant_id, account_holder_name, bank_name, account_number_last4,
         account_number_encrypted, ifsc_code, upi_id, is_primary, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
      [
        restaurantId,
        body.accountHolderName || body.legalName || 'Account holder',
        body.bankName || 'Bank',
        last4,
        encrypted,
        body.ifscCode,
        body.upiId || body.upiVpa || null,
        req.user.userId,
      ]
    );
  }

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId,
    action: 'restaurant_financial_updated',
    resourceType: 'restaurant',
    resourceId: restaurantId,
    ipAddress: req.ip,
  });

  const profile = await loadRestaurantFinancials(restaurantId);
  return res.json({ message: 'Financial details updated', profile });
}));

router.get('/upgrade-queue', requirePlatformPermission('upgrades.view'), asyncHandler(async (req, res) => {
  await syncUpgradeActivations();

  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('rua.restaurant_id', accessible, 1);
  const status = String(req.query.status || 'pending').trim();
  const statusIdx = scope.nextIndex;

  const { rows } = await pool.query(
    `SELECT rua.*, r.name AS restaurant_name, u.email AS owner_email,
            pt.provider_order_id, pt.provider_payment_id, pt.payment_purpose
     FROM restaurant_upgrade_activations rua
     INNER JOIN restaurants r ON r.id = rua.restaurant_id
     LEFT JOIN users u ON u.id = r.owner_user_id
     LEFT JOIN payment_transactions pt ON pt.id = rua.payment_transaction_id
     WHERE rua.status = $${statusIdx} ${scope.clause}
     ORDER BY rua.created_at DESC
     LIMIT 200`,
    [...scope.params, status]
  ).catch(() => ({ rows: [] }));

  return res.json({ queue: rows });
}));

router.post('/upgrade-activations/:id/activate', requirePlatformPermission('upgrades.activate'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { featureKeys = [], notes } = req.body || {};

  const { rows: activationRows } = await pool.query(
    `SELECT * FROM restaurant_upgrade_activations WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (!activationRows.length) return res.status(404).json({ message: 'Activation not found' });
  const activation = activationRows[0];
  if (activation.status !== 'pending') {
    return res.status(400).json({ message: 'Activation already processed' });
  }

  for (const featureKey of featureKeys) {
    await pool.query(
      `INSERT INTO restaurant_features (restaurant_id, feature_id, enabled, source)
       SELECT $1, id, TRUE, 'upgrade' FROM features WHERE feature_key = $2
       ON CONFLICT (restaurant_id, feature_id)
       DO UPDATE SET enabled = TRUE, source = 'upgrade', updated_at = CURRENT_TIMESTAMP`,
      [activation.restaurant_id, String(featureKey)]
    );
  }

  const { rows } = await pool.query(
    `UPDATE restaurant_upgrade_activations SET
       status = 'activated',
       activated_by_user_id = $1,
       activated_at = CURRENT_TIMESTAMP,
       notes = COALESCE($2, notes),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [req.user.userId, notes || null, id]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: activation.restaurant_id,
    action: 'upgrade_activated',
    resourceType: 'upgrade_activation',
    resourceId: id,
    metadata: { featureKeys, amount: activation.amount },
    ipAddress: req.ip,
  });

  const features = await listRestaurantFeatures(activation.restaurant_id);
  return res.json({ activation: rows[0], features });
}));

router.post('/upgrade-activations/:id/reject', requirePlatformPermission('upgrades.activate'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { notes } = req.body || {};

  const { rows } = await pool.query(
    `UPDATE restaurant_upgrade_activations SET
       status = 'rejected',
       notes = COALESCE($1, notes),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [notes || null, id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Pending activation not found' });

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: rows[0].restaurant_id,
    action: 'upgrade_rejected',
    resourceType: 'upgrade_activation',
    resourceId: id,
    ipAddress: req.ip,
  });

  return res.json({ activation: rows[0] });
}));

module.exports = router;
