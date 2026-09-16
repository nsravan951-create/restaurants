const pool = require('../config/db');

async function getRestaurantIdForUser(user) {
  if (!user?.userId) return null;
  if (user.role === 'super_admin') return null;

  const { rows } = await pool.query(
    'SELECT restaurant_id, role FROM users WHERE id = $1 LIMIT 1',
    [user.userId]
  );
  if (!rows.length) return null;

  if (rows[0].restaurant_id) {
    return Number(rows[0].restaurant_id);
  }

  if (rows[0].role === 'owner') {
    const { rows: ownedRows } = await pool.query(
      'SELECT id FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
      [user.userId]
    );
    return ownedRows[0]?.id ? Number(ownedRows[0].id) : null;
  }

  return null;
}

async function hasFeature(restaurantId, featureKey) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM features f
       LEFT JOIN restaurant_features rf
         ON rf.feature_id = f.id
        AND rf.restaurant_id = $1
        AND rf.enabled = TRUE
        AND (rf.starts_at IS NULL OR rf.starts_at <= CURRENT_TIMESTAMP)
        AND (rf.ends_at IS NULL OR rf.ends_at >= CURRENT_TIMESTAMP)
       LEFT JOIN plan_features pf ON pf.feature_id = f.id
       LEFT JOIN subscriptions s
         ON s.plan_id = pf.plan_id
        AND s.restaurant_id = $1
        AND s.status = 'active'
        AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_TIMESTAMP)
        AND (s.ends_at IS NULL OR s.ends_at >= CURRENT_TIMESTAMP)
       WHERE f.feature_key = $2
         AND f.is_active = TRUE
         AND (rf.feature_id IS NOT NULL OR s.id IS NOT NULL)
     ) AS enabled`,
    [restaurantId, featureKey]
  );
  return Boolean(rows[0]?.enabled);
}

function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'super_admin') return next();
      const restaurantId = await getRestaurantIdForUser(req.user || {});
      if (!restaurantId || !(await hasFeature(restaurantId, featureKey))) {
        return res.status(403).json({
          code: 'FEATURE_LOCKED',
          feature: featureKey,
          message: 'Upgrade to unlock this feature.',
        });
      }
      req.restaurantId = restaurantId;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

async function listRestaurantFeatures(restaurantId) {
  const { rows } = await pool.query(
    `SELECT f.feature_key, f.name,
            EXISTS (
              SELECT 1 FROM restaurant_features rf
              WHERE rf.restaurant_id = $1 AND rf.feature_id = f.id AND rf.enabled = TRUE
                AND (rf.starts_at IS NULL OR rf.starts_at <= CURRENT_TIMESTAMP)
                AND (rf.ends_at IS NULL OR rf.ends_at >= CURRENT_TIMESTAMP)
            ) OR EXISTS (
              SELECT 1
              FROM plan_features pf
              INNER JOIN subscriptions s ON s.plan_id = pf.plan_id
              WHERE pf.feature_id = f.id AND s.restaurant_id = $1 AND s.status = 'active'
                AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_TIMESTAMP)
                AND (s.ends_at IS NULL OR s.ends_at >= CURRENT_TIMESTAMP)
            ) AS enabled
     FROM features f
     WHERE f.is_active = TRUE
     ORDER BY f.name`,
    [restaurantId]
  );
  return rows;
}

module.exports = {
  getRestaurantIdForUser,
  hasFeature,
  requireFeature,
  listRestaurantFeatures,
};
