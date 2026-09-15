const pool = require('../config/db');

async function writeAuditLog({
  actorUserId = null,
  actorRole = null,
  restaurantId = null,
  action,
  resourceType,
  resourceId = null,
  metadata = {},
  ipAddress = null,
}) {
  if (!action || !resourceType) return null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_role, restaurant_id, action, resource_type, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id`,
      [
        actorUserId,
        actorRole,
        restaurantId,
        action,
        resourceType,
        resourceId ? String(resourceId) : null,
        JSON.stringify(metadata || {}),
        ipAddress,
      ]
    );
    return rows[0]?.id || null;
  } catch (error) {
    if (error.code === '42P01') {
      return null;
    }
    console.error('[audit] write failed:', error.message);
    return null;
  }
}

module.exports = { writeAuditLog };
