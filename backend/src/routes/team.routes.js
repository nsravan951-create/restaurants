const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission, PLATFORM_ROLES } = require('../middleware/platformPermissions');
const { writeAuditLog } = require('../utils/auditLog');

const router = express.Router();

const TEAM_ROLES = [...PLATFORM_ROLES].filter((role) => role !== 'super_admin');

const createTeamSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(TEAM_ROLES),
});

router.use(requireAuth());
router.use((req, res, next) => {
  if (req.user.role === 'super_admin' || PLATFORM_ROLES.has(req.user.role)) return next();
  return res.status(403).json({ message: 'Forbidden: platform team access required' });
});

router.get('/roles', asyncHandler(async (req, res) => {
  const { rows: permissions } = await pool.query(
    'SELECT permission_key, name FROM platform_permissions ORDER BY permission_key'
  );
  const { rows: mappings } = await pool.query(
    'SELECT role, permission_key FROM platform_role_permissions ORDER BY role, permission_key'
  );
  return res.json({ roles: TEAM_ROLES, permissions, mappings });
}));

router.get('/members', requirePlatformPermission('team.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
            inv.name AS invited_by_name
     FROM users u
     LEFT JOIN users inv ON inv.id = u.invited_by_user_id
     WHERE u.role = ANY($1::text[])
     ORDER BY u.created_at DESC`,
    [TEAM_ROLES]
  );
  return res.json({ members: rows });
}));

router.post('/members', requirePlatformPermission('team.write'), asyncHandler(async (req, res) => {
  const data = createTeamSchema.parse(req.body);
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [data.email]);
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active, invited_by_user_id)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     RETURNING id, name, email, role, is_active, created_at`,
    [data.name, data.email, passwordHash, data.role, req.user.userId]
  );

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'team_member_created',
    resourceType: 'user',
    resourceId: rows[0].id,
    metadata: { email: data.email, role: data.role },
    ipAddress: req.ip,
  });

  return res.status(201).json({ message: 'Team member created', member: rows[0] });
}));

router.patch('/members/:userId', requirePlatformPermission('team.write'), asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [userId]);
  if (!rows.length || !TEAM_ROLES.includes(rows[0].role)) {
    return res.status(404).json({ message: 'Team member not found' });
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (req.body?.isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    params.push(Boolean(req.body.isActive));
  }
  if (req.body?.role && TEAM_ROLES.includes(req.body.role)) {
    updates.push(`role = $${idx++}`);
    params.push(req.body.role);
  }
  if (req.body?.password) {
    updates.push(`password_hash = $${idx++}`);
    params.push(await bcrypt.hash(String(req.body.password), 10));
  }

  if (!updates.length) return res.status(400).json({ message: 'No valid fields to update' });
  params.push(userId);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'team_member_updated',
    resourceType: 'user',
    resourceId: userId,
    metadata: { fields: Object.keys(req.body || {}) },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Team member updated' });
}));

router.get('/restaurants', requirePlatformPermission('restaurants.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.is_active, u.email AS owner_email,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS total_revenue
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     LEFT JOIN orders o ON o.restaurant_id = r.id
     GROUP BY r.id, u.email
     ORDER BY r.name ASC`
  );
  return res.json({ restaurants: rows });
}));

router.get('/audit-logs', requirePlatformPermission('audit.read'), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const { rows } = await pool.query(
    `SELECT id, actor_user_id, actor_role, restaurant_id, action, resource_type,
            resource_id, metadata, ip_address, created_at
     FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  ).catch((error) => {
    if (error.code === '42P01') return { rows: [] };
    throw error;
  });
  return res.json({ logs: rows });
}));

router.get('/me/permissions', asyncHandler(async (req, res) => {
  if (req.user.role === 'super_admin') {
    const { rows } = await pool.query('SELECT permission_key FROM platform_permissions ORDER BY permission_key');
    return res.json({ role: req.user.role, permissions: rows.map((r) => r.permission_key) });
  }
  const { rows } = await pool.query(
    `SELECT permission_key FROM platform_role_permissions WHERE role = $1 ORDER BY permission_key`,
    [req.user.role]
  );
  return res.json({ role: req.user.role, permissions: rows.map((r) => r.permission_key) });
}));

module.exports = router;
