const express = require('express');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(requireAuth(['super_admin']));

router.get('/restaurants', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.address, r.is_active, u.name AS owner_name, u.email AS owner_email
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     ORDER BY r.id DESC`
  );

  return res.json({ restaurants: rows });
}));

router.patch('/restaurants/:restaurantId/toggle', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  await pool.query(
    'UPDATE restaurants SET is_active = NOT is_active WHERE id = $1',
    [restaurantId]
  );

  return res.json({ message: 'Restaurant status toggled' });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const { rows: orderRows } = await pool.query('SELECT COUNT(*)::int AS "totalOrders" FROM orders');
  const { rows: restaurantRows } = await pool.query('SELECT COUNT(*)::int AS "totalRestaurants" FROM restaurants');
  const { rows: activeAdsRows } = await pool.query('SELECT COUNT(*)::int AS "totalActiveAds" FROM ads WHERE is_active = TRUE');
  const ordersRow = orderRows[0];
  const restaurantsRow = restaurantRows[0];
  const activeAdsRow = activeAdsRows[0];

  return res.json({
    totalOrders: ordersRow.totalOrders,
    totalRestaurants: restaurantsRow.totalRestaurants,
    totalActiveAds: activeAdsRow.totalActiveAds,
  });
}));

module.exports = router;
