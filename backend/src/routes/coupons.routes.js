const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');
const { requireFeature } = require('../utils/featureAccess');
const { validateCoupon } = require('../utils/coupons');

const router = express.Router();

const couponSchema = z.object({
  restaurantId: z.number().int().positive(),
  code: z.string().min(2).max(40),
  description: z.string().optional().default(''),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  discountValue: z.number().positive(),
  minOrderAmount: z.number().nonnegative().default(0),
  maxDiscountAmount: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

router.post('/validate', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.body?.restaurantId || 0);
  const subtotal = Number(req.body?.subtotal || 0);
  const code = req.body?.code;

  if (!restaurantId || subtotal <= 0) {
    return res.status(400).json({ message: 'restaurantId and subtotal are required' });
  }

  const result = await validateCoupon({ restaurantId, code, subtotal });
  if (!result.ok) return res.status(400).json({ message: result.message });
  return res.json(result);
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin']), requireFeature('coupons'), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, code, description, discount_type, discount_value, min_order_amount,
            max_discount_amount, usage_limit, used_count, starts_at, ends_at, is_active
     FROM coupons WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [restaurantId]
  );
  return res.json({ coupons: rows });
}));

router.post('/', requireAuth(['owner', 'super_admin']), requireFeature('coupons'), asyncHandler(async (req, res) => {
  const data = couponSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    discountValue: Number(req.body.discountValue),
    minOrderAmount: Number(req.body.minOrderAmount || 0),
    maxDiscountAmount: req.body.maxDiscountAmount != null ? Number(req.body.maxDiscountAmount) : null,
    usageLimit: req.body.usageLimit != null ? Number(req.body.usageLimit) : null,
  });

  await ensureRestaurantAccess(req.user, data.restaurantId);

  const { rows } = await pool.query(
    `INSERT INTO coupons
       (restaurant_id, code, description, discount_type, discount_value, min_order_amount,
        max_discount_amount, usage_limit, starts_at, ends_at, is_active)
     VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      data.restaurantId,
      data.code,
      data.description,
      data.discountType,
      data.discountValue,
      data.minOrderAmount,
      data.maxDiscountAmount,
      data.usageLimit,
      data.startsAt || null,
      data.endsAt || null,
      data.isActive,
    ]
  );

  return res.status(201).json({ message: 'Coupon created', couponId: rows[0].id });
}));

router.patch('/:couponId', requireAuth(['owner', 'super_admin']), requireFeature('coupons'), asyncHandler(async (req, res) => {
  const couponId = Number(req.params.couponId);
  const { rows } = await pool.query('SELECT id, restaurant_id FROM coupons WHERE id = $1 LIMIT 1', [couponId]);
  if (!rows.length) return res.status(404).json({ message: 'Coupon not found' });
  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);

  const fields = {
    description: req.body.description,
    is_active: req.body.isActive,
    ends_at: req.body.endsAt,
  };
  const updates = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!updates.length) return res.status(400).json({ message: 'No fields to update' });

  const setClause = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const values = updates.map(([, v]) => v);
  values.push(couponId);

  await pool.query(`UPDATE coupons SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`, values);
  return res.json({ message: 'Coupon updated' });
}));

module.exports = router;
