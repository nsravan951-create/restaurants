const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const {
  fetchActiveInlineAds,
  replaceAdRestaurantTargets,
  fetchAdRestaurantTargets,
  isInlineAdEligibleForRestaurant,
} = require('../utils/inlineAds');

const router = express.Router();

const adSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().or(z.literal('')).default(''),
  mobileImageUrl: z.string().url().optional().or(z.literal('')).nullable(),
  videoUrl: z.string().url().optional().or(z.literal('')).default(''),
  mediaType: z.enum(['image', 'video', 'banner']).default('image'),
  displayMode: z.enum(['grid', 'carousel', 'inline', 'vertical']).default('grid'),
  displayOrder: z.number().int().optional().default(0),
  targetLink: z.string().url(),
  ctaText: z.string().min(1).max(80).optional().default('Order Now'),
  inlineFrequency: z.number().int().min(2).max(6).optional().default(3),
  targetScope: z.enum(['all', 'selected']).optional().default('all'),
  targetRestaurantIds: z.array(z.number().int().positive()).optional().default([]),
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
  if (data.targetScope === 'selected' && !data.targetRestaurantIds.length && !data.restaurantId) {
    ctx.addIssue({ code: 'custom', message: 'Select at least one restaurant for targeted ads' });
  }
});

async function attachTargetsToAds(rows) {
  if (!rows.length) return rows;

  const adIds = rows.map((row) => row.id);
  const { rows: targetRows } = await pool.query(
    `SELECT ad_id, restaurant_id
     FROM ad_restaurant_targets
     WHERE ad_id = ANY($1::int[])
     ORDER BY restaurant_id ASC`,
    [adIds]
  );

  const targetsByAd = targetRows.reduce((acc, row) => {
    (acc[row.ad_id] ||= []).push(Number(row.restaurant_id));
    return acc;
  }, {});

  return rows.map((row) => ({
    ...row,
    target_restaurant_ids: targetsByAd[row.id] || [],
  }));
}

router.get('/active', asyncHandler(async (req, res) => {
  const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;
  const placement = String(req.query.placement || '').trim().toLowerCase();

  let query = `SELECT
                 a.id,
                 a.title,
                 a.description,
                 a.image_url,
                 a.mobile_image_url,
                 a.video_url,
                 a.media_type,
                 a.target_link,
                 a.cta_text,
                 a.restaurant_id,
                 a.display_mode,
                 a.display_order,
                 a.inline_frequency,
                 a.target_scope,
                 COALESCE(
                   json_agg(art.restaurant_id) FILTER (WHERE art.restaurant_id IS NOT NULL),
                   '[]'::json
                 ) AS target_restaurant_ids
               FROM ads a
               LEFT JOIN ad_restaurant_targets art ON art.ad_id = a.id
               WHERE a.is_active = TRUE
                 AND (a.starts_at IS NULL OR a.starts_at <= NOW())
                 AND (a.ends_at IS NULL OR a.ends_at >= NOW())`;
  const params = [];

  if (placement === 'inline') {
    query += " AND a.display_mode IN ('inline', 'vertical')";
  }

  query += ' GROUP BY a.id ORDER BY a.display_order ASC, a.id DESC';

  const { rows } = await pool.query(query, params);
  const ads = restaurantId
    ? rows.filter((row) => isInlineAdEligibleForRestaurant(row, restaurantId))
    : rows;

  return res.json({ ads });
}));

router.post('/click/:adId', asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('UPDATE ads SET clicks = clicks + 1 WHERE id = $1', [adId]);
  return res.json({ message: 'Click tracked' });
}));

router.post('/impression/:adId', asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('UPDATE ads SET impressions = impressions + 1 WHERE id = $1', [adId]);
  return res.json({ message: 'Impression tracked' });
}));

router.get('/', requireAuth(['super_admin', 'owner']), asyncHandler(async (req, res) => {
  let rows = [];

  if (req.user.role === 'super_admin') {
    const result = await pool.query('SELECT * FROM ads ORDER BY display_order ASC, id DESC');
    rows = result.rows;
  } else {
    const { rows: owned } = await pool.query(
      'SELECT id FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
      [req.user.userId]
    );
    const restaurantId = owned[0]?.id;
    if (!restaurantId) return res.json({ ads: [] });

    const result = await pool.query(
      `SELECT *
       FROM ads
       WHERE restaurant_id IS NULL OR restaurant_id = $1
       ORDER BY display_order ASC, id DESC`,
      [restaurantId]
    );
    rows = result.rows;
  }

  const ads = await attachTargetsToAds(rows);
  return res.json({ ads });
}));

router.post('/', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const parsed = adSchema.parse({
    ...req.body,
    restaurantId: req.body.restaurantId !== undefined && req.body.restaurantId !== null
      ? Number(req.body.restaurantId)
      : null,
    displayOrder: req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : 0,
    inlineFrequency: req.body.inlineFrequency !== undefined ? Number(req.body.inlineFrequency) : 3,
    targetRestaurantIds: Array.isArray(req.body.targetRestaurantIds)
      ? req.body.targetRestaurantIds.map((id) => Number(id))
      : [],
  });

  const targetRestaurantIds = parsed.targetScope === 'selected'
    ? (parsed.targetRestaurantIds.length ? parsed.targetRestaurantIds : (parsed.restaurantId ? [parsed.restaurantId] : []))
    : [];

  const result = await pool.query(
    `INSERT INTO ads (
       title, description, image_url, mobile_image_url, video_url, media_type, display_mode, display_order,
       target_link, cta_text, inline_frequency, target_scope, restaurant_id, is_active, starts_at, ends_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      parsed.title,
      parsed.description || null,
      parsed.imageUrl || null,
      parsed.mobileImageUrl || null,
      parsed.videoUrl || null,
      parsed.mediaType,
      parsed.displayMode,
      parsed.displayOrder,
      parsed.targetLink,
      parsed.ctaText,
      parsed.inlineFrequency,
      parsed.targetScope,
      parsed.targetScope === 'selected' ? null : parsed.restaurantId,
      parsed.isActive,
      parsed.startsAt || null,
      parsed.endsAt || null,
    ]
  );

  const adId = result.rows[0].id;
  if (parsed.targetScope === 'selected') {
    await replaceAdRestaurantTargets(pool, adId, targetRestaurantIds);
  }

  return res.status(201).json({ message: 'Ad created', adId });
}));

router.put('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  const updates = {
    title: req.body.title,
    description: req.body.description,
    image_url: req.body.imageUrl,
    mobile_image_url: req.body.mobileImageUrl,
    video_url: req.body.videoUrl,
    media_type: req.body.mediaType,
    display_mode: req.body.displayMode,
    display_order: req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : undefined,
    target_link: req.body.targetLink,
    cta_text: req.body.ctaText,
    inline_frequency: req.body.inlineFrequency !== undefined ? Number(req.body.inlineFrequency) : undefined,
    target_scope: req.body.targetScope,
    restaurant_id: req.body.restaurantId !== undefined
      ? (req.body.restaurantId === null ? null : Number(req.body.restaurantId))
      : undefined,
    is_active: req.body.isActive !== undefined ? req.body.isActive : undefined,
    starts_at: req.body.startsAt,
    ends_at: req.body.endsAt,
  };

  const fields = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!fields.length && !Array.isArray(req.body.targetRestaurantIds)) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  if (fields.length) {
    const setClause = fields.map(([key], index) => `${key} = $${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);
    values.push(adId);
    await pool.query(
      `UPDATE ads SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
      values
    );
  }

  if (req.body.targetScope === 'selected' && Array.isArray(req.body.targetRestaurantIds)) {
    await replaceAdRestaurantTargets(
      pool,
      adId,
      req.body.targetRestaurantIds.map((id) => Number(id))
    );
  }

  if (req.body.targetScope === 'all') {
    await pool.query('DELETE FROM ad_restaurant_targets WHERE ad_id = $1', [adId]);
  }

  return res.json({ message: 'Ad updated' });
}));

router.get('/:adId/targets', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const restaurantIds = await fetchAdRestaurantTargets(pool, req.params.adId);
  return res.json({ restaurantIds });
}));

router.delete('/:adId', requireAuth(['super_admin']), asyncHandler(async (req, res) => {
  const { adId } = req.params;
  await pool.query('DELETE FROM ads WHERE id = $1', [adId]);
  return res.json({ message: 'Ad deleted' });
}));

module.exports = router;
