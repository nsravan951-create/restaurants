const pool = require('../config/db');

async function ensureRestaurantAccess(user, restaurantId) {
  if (user.role === 'super_admin') return true;

  const { rows } = await pool.query('SELECT id, owner_user_id FROM restaurants WHERE id = $1', [restaurantId]);
  if (!rows.length) {
    const err = new Error('Restaurant not found');
    err.status = 404;
    throw err;
  }

  if (user.role === 'owner' && rows[0].owner_user_id === user.userId) return true;

  if (user.role === 'kitchen' || user.role === 'staff') {
    const { rows: userRows } = await pool.query('SELECT restaurant_id FROM users WHERE id = $1', [user.userId]);
    if (userRows.length && Number(userRows[0].restaurant_id) === Number(restaurantId)) return true;
  }

  const err = new Error('Forbidden for this restaurant');
  err.status = 403;
  throw err;
}

module.exports = { ensureRestaurantAccess };
