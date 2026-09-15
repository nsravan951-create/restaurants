const pool = require('../config/db');

async function validateCoupon({ restaurantId, code, subtotal }) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) {
    return { ok: false, message: 'Coupon code is required' };
  }

  const { rows } = await pool.query(
    `SELECT id, discount_type, discount_value, min_order_amount, max_discount_amount,
            usage_limit, used_count, starts_at, ends_at, is_active
     FROM coupons
     WHERE restaurant_id = $1 AND UPPER(code) = $2
     LIMIT 1`,
    [restaurantId, normalizedCode]
  );

  if (!rows.length) return { ok: false, message: 'Invalid coupon code' };

  const coupon = rows[0];
  if (!coupon.is_active) return { ok: false, message: 'Coupon is not active' };
  if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
    return { ok: false, message: 'Coupon is not yet valid' };
  }
  if (coupon.ends_at && new Date(coupon.ends_at) < new Date()) {
    return { ok: false, message: 'Coupon has expired' };
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    return { ok: false, message: 'Coupon usage limit reached' };
  }
  if (Number(subtotal) < Number(coupon.min_order_amount)) {
    return { ok: false, message: `Minimum order amount is ${coupon.min_order_amount}` };
  }

  let discount = coupon.discount_type === 'percent'
    ? Number(subtotal) * Number(coupon.discount_value) / 100
    : Number(coupon.discount_value);

  if (coupon.max_discount_amount !== null) {
    discount = Math.min(discount, Number(coupon.max_discount_amount));
  }
  discount = Math.min(discount, Number(subtotal));
  discount = Math.max(0, Number(discount.toFixed(2)));

  const total = Math.max(0, Number((Number(subtotal) - discount).toFixed(2)));

  return {
    ok: true,
    couponId: coupon.id,
    code: normalizedCode,
    discountAmount: discount,
    total,
  };
}

async function recordCouponRedemption(conn, { couponId, orderId, restaurantId, discountAmount }) {
  await conn.query(
    `INSERT INTO coupon_redemptions (coupon_id, order_id, restaurant_id, discount_amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO NOTHING`,
    [couponId, orderId, restaurantId, discountAmount]
  );
  await conn.query(
    `UPDATE coupons SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [couponId]
  );
}

module.exports = { validateCoupon, recordCouponRedemption };
