const pool = require('../config/db');
const { resolveFeatureRow } = require('./featureResolution');

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

const FEATURE_RESOLUTION_SQL = `
  SELECT
    f.feature_key,
    f.name,
    rf.enabled AS admin_enabled,
    rf.source AS admin_source,
    rf.feature_id AS override_id,
    EXISTS (
      SELECT 1
      FROM plan_features pf
      INNER JOIN subscriptions s ON s.plan_id = pf.plan_id
      WHERE pf.feature_id = f.id
        AND s.restaurant_id = $1
        AND s.status = 'active'
        AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_TIMESTAMP)
        AND (s.ends_at IS NULL OR s.ends_at >= CURRENT_TIMESTAMP)
    ) AS from_plan
  FROM features f
  LEFT JOIN restaurant_features rf
    ON rf.feature_id = f.id AND rf.restaurant_id = $1
  WHERE f.is_active = TRUE
`;

async function hasFeature(restaurantId, featureKey) {
  const { rows } = await pool.query(
    `${FEATURE_RESOLUTION_SQL} AND f.feature_key = $2 LIMIT 1`,
    [restaurantId, featureKey]
  );
  if (!rows.length) return false;
  return resolveFeatureRow(rows[0]).enabled;
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
    `${FEATURE_RESOLUTION_SQL} ORDER BY f.name`,
    [restaurantId]
  );
  return rows.map(resolveFeatureRow);
}

module.exports = {
  getRestaurantIdForUser,
  hasFeature,
  requireFeature,
  listRestaurantFeatures,
};
