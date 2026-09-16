const pool = require('../config/db');
const { restaurantScopeClause } = require('./scopeUtils');

const { PLATFORM_TEAM_ROLE_KEYS } = require('../config/platformRoleCatalog');

const RESTAURANT_ROLES = new Set(['owner', 'kitchen', 'staff']);
const PLATFORM_BUILTIN = new Set(['super_admin', ...PLATFORM_TEAM_ROLE_KEYS]);

async function isPlatformRole(role) {
  if (!role || role === 'super_admin') return role === 'super_admin';
  if (PLATFORM_BUILTIN.has(role)) return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM platform_roles WHERE role_key = $1 AND status = 'active' LIMIT 1`,
    [role]
  ).catch(() => ({ rows: [] }));
  return rows.length > 0;
}

async function getUserProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, role, is_active, scope_type, scope_restaurant_id, department_id, token_version
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function listUserPermissions(userId, role) {
  if (role === 'super_admin') {
    const { rows } = await pool.query('SELECT permission_key FROM platform_permissions ORDER BY permission_key');
    return rows.map((r) => r.permission_key);
  }

  const { rows: rolePerms } = await pool.query(
    `SELECT permission_key FROM platform_role_permissions WHERE role = $1`,
    [role]
  );

  const { rows: overrides } = await pool.query(
    `SELECT permission_key, granted FROM user_permission_overrides
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
    [userId]
  );

  const set = new Set(rolePerms.map((r) => r.permission_key));
  overrides.forEach((row) => {
    if (row.granted) set.add(row.permission_key);
    else set.delete(row.permission_key);
  });
  return [...set];
}

async function userHasPermission(userId, role, permissionKey) {
  if (role === 'super_admin') return true;
  const permissions = await listUserPermissions(userId, role);
  return permissions.includes(permissionKey);
}

async function getAccessibleRestaurantIds(userId, role) {
  if (role === 'super_admin') return null;

  const profile = await getUserProfile(userId);
  if (!profile) return [];

  if (profile.scope_type === 'global') return null;
  if (profile.scope_type === 'restaurant' && profile.scope_restaurant_id) {
    return [Number(profile.scope_restaurant_id)];
  }

  const { rows } = await pool.query(
    'SELECT restaurant_id FROM user_restaurant_assignments WHERE user_id = $1',
    [userId]
  );
  if (rows.length) return rows.map((r) => Number(r.restaurant_id));
  return null;
}

module.exports = {
  RESTAURANT_ROLES,
  PLATFORM_BUILTIN,
  isPlatformRole,
  getUserProfile,
  listUserPermissions,
  userHasPermission,
  getAccessibleRestaurantIds,
  restaurantScopeClause,
};
