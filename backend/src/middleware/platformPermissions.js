const pool = require('../config/db');
const {
  isPlatformRole,
  getUserProfile,
  userHasPermission,
} = require('../utils/rbac');
const { PLATFORM_ROLES } = require('../config/platformRoleCatalog');

async function userHasPermissionLegacy(role, permissionKey) {
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
      const userId = req.user?.userId;
      if (!role || !userId) return res.status(401).json({ message: 'Unauthorized' });

      if (role === 'super_admin') return next();

      const platform = await isPlatformRole(role);
      if (!platform && !PLATFORM_ROLES.has(role)) {
        return res.status(403).json({ message: 'Forbidden: platform access required' });
      }

      const profile = await getUserProfile(userId);
      if (!profile?.is_active) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      const tokenVersion = Number(req.user.tokenVersion || 0);
      if (Number(profile.token_version || 0) > tokenVersion) {
        return res.status(401).json({ message: 'Session revoked. Please sign in again.' });
      }

      const allowed = await userHasPermission(userId, role, permissionKey);
      if (!allowed) {
        return res.status(403).json({
          message: 'Forbidden: insufficient permission',
          permission: permissionKey,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requirePlatformAccess() {
  return async (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ message: 'Unauthorized' });
    if (role === 'super_admin') return next();
    const platform = await isPlatformRole(role);
    if (platform || PLATFORM_ROLES.has(role)) return next();
    return res.status(403).json({ message: 'Forbidden: platform access required' });
  };
}

module.exports = {
  PLATFORM_ROLES,
  userHasPermission: userHasPermissionLegacy,
  requirePlatformPermission,
  requirePlatformAccess,
};
