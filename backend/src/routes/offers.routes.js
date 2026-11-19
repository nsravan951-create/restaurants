const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');
const { requireFeature } = require('../utils/featureAccess');

const router = express.Router();
const OFFER_TYPES = ['combo', 'percentage', 'flat', 'bogo', 'free_item', 'special_price'];

const itemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100),
  isRewardItem: z.boolean().optional().default(false),
});

const offerSchema = z.object({
  restaurantId: z.number().int().positive(),
  title: z.string().trim().min(2).max(160),
  description: z.string().max(500).optional().default(''),
  imageUrl: z.string().url().or(z.literal('')).optional().default(''),
  offerType: z.enum(OFFER_TYPES),
  offerPrice: z.number().nonnegative(),
  discountValue: z.number().nonnegative().optional().default(0),
  discountType: z.enum(['percent', 'fixed']).optional().default('fixed'),
  minimumOrderAmount: z.number().nonnegative().optional().default(0),
  maximumDiscount: z.number().nonnegative().nullable().optional(),
  couponCode: z.string().trim().max(40).optional().default(''),
  startAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  allowStacking: z.boolean().optional().default(false),
  items: z.array(itemSchema).max(100).default([]),
});

function statusSql(alias = 'o') {
  return `CASE
    WHEN ${alias}.status = 'paused' THEN 'paused'
    WHEN ${alias}.start_at > CURRENT_TIMESTAMP THEN 'scheduled'
    WHEN ${alias}.expires_at IS NOT NULL AND ${alias}.expires_at <= CURRENT_TIMESTAMP THEN 'expired'
    ELSE 'active'
  END`;
}

const offerSelect = `
  SELECT o.id, o.restaurant_id, o.title, o.description, o.image_url, o.offer_type,
         o.original_price, o.offer_price, o.discount_value, o.discount_type,
         o.minimum_order_amount, o.maximum_discount, o.coupon_code, o.start_at,
         o.expires_at, o.usage_limit, o.per_customer_limit, o.usage_count,
         o.status, o.allow_stacking, o.created_at, o.updated_at,
         ${statusSql()} AS computed_status,
         COALESCE(json_agg(json_build_object(
           'id', oi.id, 'menu_item_id', oi.menu_item_id,
           'name', oi.item_name_snapshot, 'quantity', oi.quantity,
           'price', oi.price_snapshot, 'is_reward_item', oi.is_reward_item
         ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
  FROM offers o
  LEFT JOIN offer_items oi ON oi.offer_id = o.id`;

async function loadOfferItems(conn, restaurantId, requestedItems) {
  if (!requestedItems.length) return [];
  const ids = [...new Set(requestedItems.map((item) => item.menuItemId))];
  const { rows } = await conn.query(
    `SELECT id, name, price FROM menu_items
     WHERE restaurant_id = $1 AND is_available = TRUE
       AND id IN (${ids.map((_, index) => `$${index + 2}`).join(',')})`,
    [restaurantId, ...ids]
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  if (rows.length !== ids.length) {
    const error = new Error('Offers can only include available menu items from this restaurant');
    error.status = 400;
    throw error;
  }
  return requestedItems.map((item) => {
    const menu = byId.get(item.menuItemId);
    return [menu.id, menu.name, item.quantity, menu.price, item.isRewardItem];
  });
}

router.get('/restaurant/:restaurantId/active', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return res.status(400).json({ message: 'Invalid restaurant ID' });
  }
  const { rows } = await pool.query(
    `${offerSelect}
     WHERE o.restaurant_id = $1 AND o.status = 'active'
       AND o.start_at <= CURRENT_TIMESTAMP
       AND (o.expires_at IS NULL OR o.expires_at > CURRENT_TIMESTAMP)
       AND (o.usage_limit IS NULL OR o.usage_count < o.usage_limit)
     GROUP BY o.id
     ORDER BY o.start_at DESC, o.id DESC`,
    [restaurantId]
  );
  return res.json({ offers: rows });
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  await ensureRestaurantAccess(req.user, restaurantId);
  const { rows } = await pool.query(
    `${offerSelect}
     WHERE o.restaurant_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [restaurantId]
  );
  const stats = rows.reduce((result, offer) => {
    result.total += 1;
    result[offer.computed_status] = (result[offer.computed_status] || 0) + 1;
    result.redemptions += Number(offer.usage_count || 0);
    return result;
  }, { total: 0, active: 0, scheduled: 0, expired: 0, paused: 0, redemptions: 0 });
  return res.json({ offers: rows, stats });
}));

router.post('/', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const data = offerSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    offerPrice: Number(req.body.offerPrice),
    discountValue: Number(req.body.discountValue || 0),
    minimumOrderAmount: Number(req.body.minimumOrderAmount || 0),
    maximumDiscount: req.body.maximumDiscount == null ? null : Number(req.body.maximumDiscount),
    usageLimit: req.body.usageLimit == null ? null : Number(req.body.usageLimit),
    perCustomerLimit: req.body.perCustomerLimit == null ? null : Number(req.body.perCustomerLimit),
  });
  await ensureRestaurantAccess(req.user, data.restaurantId);
  if (data.offerType === 'combo' && !data.items.length) {
    return res.status(400).json({ message: 'Combo offers require at least one menu item' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const itemRows = await loadOfferItems(conn, data.restaurantId, data.items);
    const originalPrice = itemRows.reduce((sum, item) => sum + Number(item[3]) * item[2], 0);
    if (data.offerPrice > originalPrice && data.items.length) {
      const error = new Error('Offer price cannot be greater than the original item total');
      error.status = 400;
      throw error;
    }
    const discountValue = data.discountValue || Math.max(0, originalPrice - data.offerPrice);
    const { rows } = await conn.query(
      `INSERT INTO offers
       (restaurant_id, title, description, image_url, offer_type, original_price, offer_price,
        discount_value, discount_type, minimum_order_amount, maximum_discount, coupon_code,
        start_at, expires_at, usage_limit, per_customer_limit, allow_stacking)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,''),COALESCE($13,CURRENT_TIMESTAMP),$14,$15,$16,$17)
       RETURNING id`,
      [data.restaurantId, data.title, data.description, data.imageUrl, data.offerType,
        originalPrice, data.offerPrice, discountValue, data.discountType, data.minimumOrderAmount,
        data.maximumDiscount, data.couponCode.toUpperCase(), data.startAt || null, data.expiresAt || null,
        data.usageLimit, data.perCustomerLimit, data.allowStacking]
    );
    for (const [menuItemId, name, quantity, price, isRewardItem] of itemRows) {
      await conn.query(
        `INSERT INTO offer_items (offer_id, menu_item_id, item_name_snapshot, quantity, price_snapshot, is_reward_item)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rows[0].id, menuItemId, name, quantity, price, isRewardItem]
      );
    }
    await conn.query('COMMIT');
    return res.status(201).json({ message: 'Offer created', offerId: rows[0].id });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.patch('/:offerId/status', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  const { rows } = await pool.query('SELECT restaurant_id FROM offers WHERE id = $1 LIMIT 1', [offerId]);
  if (!rows.length) return res.status(404).json({ message: 'Offer not found' });
  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);
  const status = req.body?.status;
  if (!['active', 'paused'].includes(status)) return res.status(400).json({ message: 'Status must be active or paused' });
  await pool.query('UPDATE offers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, offerId]);
  return res.json({ message: `Offer ${status}` });
}));

router.patch('/:offerId', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  const { rows } = await pool.query('SELECT restaurant_id FROM offers WHERE id = $1 LIMIT 1', [offerId]);
  if (!rows.length) return res.status(404).json({ message: 'Offer not found' });
  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);
  const fields = {
    title: req.body?.title,
    description: req.body?.description,
    image_url: req.body?.imageUrl,
    start_at: req.body?.startAt,
    expires_at: req.body?.expiresAt,
  };
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!updates.length) return res.status(400).json({ message: 'No editable fields supplied' });
  const values = updates.map(([, value]) => value);
  values.push(offerId);
  const setClause = updates.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  await pool.query(`UPDATE offers SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`, values);
  return res.json({ message: 'Offer updated' });
}));

router.post('/:offerId/duplicate', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: offers } = await conn.query('SELECT * FROM offers WHERE id = $1 LIMIT 1', [offerId]);
    if (!offers.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Offer not found' });
    }
    await ensureRestaurantAccess(req.user, offers[0].restaurant_id);
    const offer = offers[0];
    const { rows: copy } = await conn.query(
      `INSERT INTO offers
       (restaurant_id, title, description, image_url, offer_type, original_price, offer_price,
        discount_value, discount_type, minimum_order_amount, maximum_discount, coupon_code,
        start_at, expires_at, usage_limit, per_customer_limit, usage_count, status, allow_stacking)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,$13,$14,$15,0,'paused',$16)
       RETURNING id`,
      [offer.restaurant_id, `${offer.title} (Copy)`, offer.description, offer.image_url, offer.offer_type,
        offer.original_price, offer.offer_price, offer.discount_value, offer.discount_type,
        offer.minimum_order_amount, offer.maximum_discount, offer.coupon_code, offer.expires_at,
        offer.usage_limit, offer.per_customer_limit, offer.allow_stacking]
    );
    await conn.query(
      `INSERT INTO offer_items (offer_id, menu_item_id, item_name_snapshot, quantity, price_snapshot, is_reward_item)
       SELECT $1, menu_item_id, item_name_snapshot, quantity, price_snapshot, is_reward_item
       FROM offer_items WHERE offer_id = $2`,
      [copy[0].id, offerId]
    );
    await conn.query('COMMIT');
    return res.status(201).json({ message: 'Offer duplicated', offerId: copy[0].id });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.delete('/:offerId', requireAuth(['owner', 'super_admin']), requireFeature('offers'), asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  const { rows } = await pool.query('SELECT restaurant_id FROM offers WHERE id = $1 LIMIT 1', [offerId]);
  if (!rows.length) return res.status(404).json({ message: 'Offer not found' });
  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);
  await pool.query('DELETE FROM offers WHERE id = $1', [offerId]);
  return res.json({ message: 'Offer deleted' });
}));

module.exports = router;
