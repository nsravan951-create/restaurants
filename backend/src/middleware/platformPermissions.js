const pool = require('../config/db');

const PLATFORM_ROLES = new Set([
  'super_admin',
  'finance_manager',
  'restaurant_manager',
  'promotions_manager',
  'user_enquiry_manager',
  'database_manager',
  'backend_manager',
  'analytics_manager',
]);

async function userHasPermission(role, permissionKey) {
  if (role === 'super_admin') return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM platform_role_permissions WHERE role = $1 AND permission_key = $2 LIMIT 1`,
    [role, permissionKey]
  );
  return rows.length > 0;
}

function requirePlatformPermission(permissionKey) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ message: 'Unauthorized' });
      if (role === 'super_admin') return next();
      if (!PLATFORM_ROLES.has(role)) {
        return res.status(403).json({ message: 'Forbidden: platform access required' });
      }
      const allowed = await userHasPermission(role, permissionKey);
      if (!allowed) {
        return res.status(403).json({ message: 'Forbidden: insufficient permission', permission: permissionKey });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requirePlatformAccess() {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ message: 'Unauthorized' });
    if (role === 'super_admin' || PLATFORM_ROLES.has(role)) return next();
    return res.status(403).json({ message: 'Forbidden: platform access required' });
  };
}

module.exports = {
  PLATFORM_ROLES,
  userHasPermission,
  requirePlatformPermission,
  requirePlatformAccess,
};
