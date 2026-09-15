const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');

const router = express.Router();

const createReviewSchema = z.object({
  orderId: z.number().int().positive(),
  sessionToken: z.string().min(10),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().default(''),
});

router.post('/', asyncHandler(async (req, res) => {
  const data = createReviewSchema.parse({
    ...req.body,
    orderId: Number(req.body.orderId),
    rating: Number(req.body.rating),
  });

  const { rows: orderRows } = await pool.query(
    `SELECT o.id, o.restaurant_id, o.payment_status
     FROM orders o
     INNER JOIN table_sessions s ON s.id = o.table_session_id
     WHERE o.id = $1 AND s.session_token = $2
     LIMIT 1`,
    [data.orderId, data.sessionToken]
  );

  if (!orderRows.length) return res.status(404).json({ message: 'Order not found' });
  if (orderRows[0].payment_status !== 'paid') {
    return res.status(409).json({ message: 'Reviews are allowed only after payment' });
  }

  const { rows } = await pool.query(
    `INSERT INTO reviews (restaurant_id, order_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id, rating, comment, created_at`,
    [orderRows[0].restaurant_id, data.orderId, data.rating, data.comment]
  );

  if (!rows.length) {
    return res.status(409).json({ message: 'Review already submitted for this order' });
  }

  return res.status(201).json({ message: 'Review submitted', review: rows[0] });
}));

router.get('/restaurant/:restaurantId/public', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const { rows } = await pool.query(
    `SELECT rating, comment, created_at
     FROM reviews
     WHERE restaurant_id = $1 AND is_public = TRUE AND is_moderated = FALSE
     ORDER BY created_at DESC
     LIMIT 50`,
    [restaurantId]
  );

  const { rows: agg } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(4,2) AS average
     FROM reviews
     WHERE restaurant_id = $1 AND is_public = TRUE AND is_moderated = FALSE`,
    [restaurantId]
  );

  return res.json({ reviews: rows, summary: agg[0] });
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, order_id, rating, comment, is_public, is_moderated, created_at
     FROM reviews WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [restaurantId]
  );
  return res.json({ reviews: rows });
}));

router.patch('/:reviewId/moderate', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  const { rows } = await pool.query('SELECT id, restaurant_id FROM reviews WHERE id = $1 LIMIT 1', [reviewId]);
  if (!rows.length) return res.status(404).json({ message: 'Review not found' });
  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);

  const isModerated = Boolean(req.body?.isModerated);
  const isPublic = req.body?.isPublic !== undefined ? Boolean(req.body.isPublic) : undefined;

  await pool.query(
    `UPDATE reviews
     SET is_moderated = $1,
         is_public = COALESCE($2, is_public),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [isModerated, isPublic, reviewId]
  );

  return res.json({ message: 'Review updated' });
}));

module.exports = router;
