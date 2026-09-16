const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission, PLATFORM_ROLES } = require('../middleware/platformPermissions');
const { writeAuditLog } = require('../utils/auditLog');
const { listUserPermissions, isPlatformRole } = require('../utils/rbac');
const { PLATFORM_ROLE_CATALOG, PLATFORM_TEAM_ROLE_KEYS } = require('../config/platformRoleCatalog');

const router = express.Router();

const LEGACY_TEAM_ROLES = [...PLATFORM_TEAM_ROLE_KEYS];

async function fetchActivePlatformRoleKeys() {
  const { rows } = await pool.query(
    `SELECT role_key FROM platform_roles WHERE status = 'active' ORDER BY name ASC`
  ).catch(() => ({ rows: [] }));
  const fromDb = rows.map((r) => r.role_key);
  const merged = new Set([...LEGACY_TEAM_ROLES, ...fromDb]);
  return [...merged];
}

router.use(requireAuth());
router.use((req, res, next) => {
  if (req.user.role === 'super_admin' || PLATFORM_ROLES.has(req.user.role)) return next();
  return res.status(403).json({ message: 'Forbidden: platform team access required' });
});

router.get('/roles', asyncHandler(async (req, res) => {
  const roles = await fetchActivePlatformRoleKeys();
  const { rows: permissions } = await pool.query(
    'SELECT permission_key, name, category FROM platform_permissions ORDER BY category, permission_key'
  );
  const { rows: mappings } = await pool.query(
    'SELECT role, permission_key FROM platform_role_permissions ORDER BY role, permission_key'
  );
  const { rows: roleMeta } = await pool.query(
    `SELECT pr.role_key, pr.name, pr.description, d.name AS department_name
     FROM platform_roles pr LEFT JOIN departments d ON d.id = pr.department_id
     WHERE pr.status = 'active' ORDER BY d.name, pr.name`
  ).catch(() => ({ rows: [] }));

  const catalogByKey = new Map(PLATFORM_ROLE_CATALOG.map((row) => [row.roleKey, row]));
  const enrichedMeta = (roleMeta.length ? roleMeta : roles.map((roleKey) => ({ role_key: roleKey, name: roleKey })))
    .map((row) => {
      const catalog = catalogByKey.get(row.role_key) || {};
      return {
        ...row,
        department_name: row.department_name || catalog.department || 'General',
        description: row.description || catalog.description || '',
      };
    });

  const byDepartment = enrichedMeta.reduce((acc, row) => {
    const dept = row.department_name || 'General';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(row);
    return acc;
  }, {});

  return res.json({
    roles,
    roleMeta: enrichedMeta,
    rolesByDepartment: byDepartment,
    catalog: PLATFORM_ROLE_CATALOG,
    permissions,
    mappings,
  });
}));

router.get('/members', requirePlatformPermission('team.read'), asyncHandler(async (req, res) => {
  const teamRoles = await fetchActivePlatformRoleKeys();
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.username, u.phone, u.role, u.is_active, u.created_at, u.last_login_at,
            u.scope_type, u.scope_restaurant_id, d.name AS department_name,
            inv.name AS invited_by_name
     FROM users u
     LEFT JOIN users inv ON inv.id = u.invited_by_user_id
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.role = ANY($1::text[])
     ORDER BY u.created_at DESC`,
    [teamRoles]
  );
  return res.json({ members: rows });
}));

router.post('/members', requirePlatformPermission('team.write'), asyncHandler(async (req, res) => {
  const teamRoles = await fetchActivePlatformRoleKeys();
  const createTeamSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.string().min(2),
    username: z.string().min(3).max(80).optional().nullable(),
    phone: z.string().optional().default(''),
    departmentId: z.number().int().positive().optional().nullable(),
    scopeType: z.enum(['global', 'restaurant', 'department', 'own_records']).optional().default('global'),
    scopeRestaurantId: z.number().int().positive().optional().nullable(),
  });
  const data = createTeamSchema.parse({
    ...req.body,
    username: req.body.username ? String(req.body.username).trim().toLowerCase() : null,
    departmentId: req.body.departmentId ? Number(req.body.departmentId) : null,
    scopeRestaurantId: req.body.scopeRestaurantId ? Number(req.body.scopeRestaurantId) : null,
  });

  if (data.username) {
    const { rows: usernameRows } = await pool.query(
      'SELECT id FROM users WHERE username = $1 LIMIT 1',
      [data.username]
    );
    if (usernameRows.length) return res.status(409).json({ message: 'Username already taken' });
  }

  if (!teamRoles.includes(data.role) && !(await isPlatformRole(data.role))) {
    return res.status(400).json({ message: 'Invalid platform role' });
  }

  const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [data.email]);
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (
       name, email, username, password_hash, role, is_active, invited_by_user_id,
       phone, department_id, scope_type, scope_restaurant_id, must_change_password
     ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, TRUE)
     RETURNING id, name, email, username, role, is_active, created_at`,
    [
      data.name, data.email, data.username, passwordHash, data.role, req.user.userId,
      data.phone || null, data.departmentId, data.scopeType, data.scopeRestaurantId,
    ]
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
  const teamRoles = await fetchActivePlatformRoleKeys();
  const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [userId]);
  if (!rows.length || !teamRoles.includes(rows[0].role)) {
    return res.status(404).json({ message: 'Team member not found' });
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (req.body?.isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    params.push(Boolean(req.body.isActive));
    if (!req.body.isActive) {
      updates.push(`token_version = token_version + 1`);
    }
  }
  if (req.body?.role) {
    const valid = teamRoles.includes(req.body.role) || await isPlatformRole(req.body.role);
    if (valid) {
      updates.push(`role = $${idx++}`);
      params.push(req.body.role);
    }
  }
  if (req.body?.password) {
    updates.push(`password_hash = $${idx++}`);
    params.push(await bcrypt.hash(String(req.body.password), 10));
    updates.push(`must_change_password = FALSE`);
  }
  if (req.body?.scopeType) {
    updates.push(`scope_type = $${idx++}`);
    params.push(req.body.scopeType);
  }
  if (req.body?.scopeRestaurantId !== undefined) {
    updates.push(`scope_restaurant_id = $${idx++}`);
    params.push(req.body.scopeRestaurantId ? Number(req.body.scopeRestaurantId) : null);
  }
  if (req.body?.forceLogout) {
    updates.push(`token_version = token_version + 1`);
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
  const permissions = await listUserPermissions(req.user.userId, req.user.role);
  return res.json({ role: req.user.role, permissions });
}));

module.exports = router;
