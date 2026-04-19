const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const adSchema = z.object({
  title: z.string().min(2),
  imageUrl: z.string().url(),
  targetLink: z.string().url(),
  restaurantId: z.number().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
});

router.get('/active', asyncHandler(async (req, res) => {
  const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;

  let query = `SELECT id, title, image_url, target_link, restaurant_id
               FROM ads
               WHERE is_active = TRUE
                 AND (starts_at IS NULL OR starts_at <= NOW())
                 AND (ends_at IS NULL OR ends_at >= NOW())`;
  const params = [];

  if (restaurantId) {
    query += ' AND (restaurant_id IS NULL OR restaurant_id = $1)';
    params.push(restaurantId);
  }

  query += ' ORDER BY id DESC';

  const { rows } = await pool.query(query, params);

  return res.json({ ads: rows });
}));

router.post('/click/:adId', asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('UPDATE ads SET clicks = clicks + 1 WHERE id = $1', [adId]);
  return res.json({ message: 'Click tracked' });
}));

router.get('/', requireAuth(['super_admin', 'owner']), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ads ORDER BY id DESC');
  return res.json({ ads: rows });
}));

router.post('/', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const parsed = adSchema.parse({
    ...req.body,
    restaurantId: req.body.restaurantId !== undefined && req.body.restaurantId !== null ? Number(req.body.restaurantId) : null,
  });

  const result = await pool.query(
    `INSERT INTO ads (title, image_url, target_link, restaurant_id, is_active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [parsed.title, parsed.imageUrl, parsed.targetLink, parsed.restaurantId, parsed.isActive, parsed.startsAt, parsed.endsAt]
  );

  return res.status(201).json({ message: 'Ad created', adId: result.rows[0].id });
}));

router.put('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  const updates = {
    title: req.body.title,
    image_url: req.body.imageUrl,
    target_link: req.body.targetLink,
    restaurant_id: req.body.restaurantId !== undefined ? (req.body.restaurantId === null ? null : Number(req.body.restaurantId)) : undefined,
    is_active: req.body.isActive !== undefined ? req.body.isActive : undefined,
    starts_at: req.body.startsAt,
    ends_at: req.body.endsAt,
  };

  const fields = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!fields.length) return res.status(400).json({ message: 'No fields to update' });

  const setClause = fields.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = fields.map(([, value]) => value);
  values.push(adId);

  await pool.query(`UPDATE ads SET ${setClause} WHERE id = $${values.length}`, values);
  return res.json({ message: 'Ad updated' });
}));

router.delete('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('DELETE FROM ads WHERE id = $1', [adId]);
  return res.json({ message: 'Ad deleted' });
}));

module.exports = router;
