const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const adSchema = z.object({
  title: z.string().min(2),
  imageUrl: z.string().url().optional().or(z.literal('')).default(''),
  videoUrl: z.string().url().optional().or(z.literal('')).default(''),
  mediaType: z.enum(['image', 'video', 'banner']).default('image'),
  displayMode: z.enum(['grid', 'carousel', 'inline']).default('grid'),
  displayOrder: z.number().int().optional().default(0),
  targetLink: z.string().url(),
  restaurantId: z.number().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.mediaType === 'video' && !data.videoUrl) {
    ctx.addIssue({ code: 'custom', message: 'videoUrl is required for video ads' });
  }
  if (data.mediaType !== 'video' && !data.imageUrl) {
    ctx.addIssue({ code: 'custom', message: 'imageUrl is required for image/banner ads' });
  }
});

router.get('/active', asyncHandler(async (req, res) => {
  const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;

  let query = `SELECT id, title, image_url, video_url, media_type, target_link, restaurant_id, display_mode, display_order
               FROM ads
               WHERE is_active = TRUE
                 AND (starts_at IS NULL OR starts_at <= NOW())
                 AND (ends_at IS NULL OR ends_at >= NOW())`;
  const params = [];

  if (restaurantId) {
    query += ' AND (restaurant_id IS NULL OR restaurant_id = $1)';
    params.push(restaurantId);
  }

  query += ' ORDER BY display_order ASC, id DESC';

  const { rows } = await pool.query(query, params);

  return res.json({ ads: rows });
}));

router.post('/click/:adId', asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('UPDATE ads SET clicks = clicks + 1 WHERE id = $1', [adId]);
  return res.json({ message: 'Click tracked' });
}));

router.get('/', requireAuth(['super_admin', 'owner']), asyncHandler(async (req, res) => {
  if (req.user.role === 'super_admin') {
    const { rows } = await pool.query('SELECT * FROM ads ORDER BY display_order ASC, id DESC');
    return res.json({ ads: rows });
  }

  const { rows: owned } = await pool.query(
    'SELECT id FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
    [req.user.userId]
  );
  const restaurantId = owned[0]?.id;
  if (!restaurantId) return res.json({ ads: [] });

  const { rows } = await pool.query(
    `SELECT * FROM ads
     WHERE restaurant_id IS NULL OR restaurant_id = $1
     ORDER BY display_order ASC, id DESC`,
    [restaurantId]
  );
  return res.json({ ads: rows });
}));

router.post('/', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const parsed = adSchema.parse({
    ...req.body,
    restaurantId: req.body.restaurantId !== undefined && req.body.restaurantId !== null ? Number(req.body.restaurantId) : null,
    displayOrder: req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : 0,
  });

  const result = await pool.query(
    `INSERT INTO ads (
       title, image_url, video_url, media_type, display_mode, display_order,
       target_link, restaurant_id, is_active, starts_at, ends_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      parsed.title,
      parsed.imageUrl || null,
      parsed.videoUrl || null,
      parsed.mediaType,
      parsed.displayMode,
      parsed.displayOrder,
      parsed.targetLink,
      parsed.restaurantId,
      parsed.isActive,
      parsed.startsAt || null,
      parsed.endsAt || null,
    ]
  );

  return res.status(201).json({ message: 'Ad created', adId: result.rows[0].id });
}));

router.put('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  const updates = {
    title: req.body.title,
    image_url: req.body.imageUrl,
    video_url: req.body.videoUrl,
    media_type: req.body.mediaType,
    display_mode: req.body.displayMode,
    display_order: req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : undefined,
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

  await pool.query(`UPDATE ads SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`, values);
  return res.json({ message: 'Ad updated' });
}));

router.delete('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('DELETE FROM ads WHERE id = $1', [adId]);
  return res.json({ message: 'Ad deleted' });
}));

module.exports = router;
