const test = require('node:test');
const assert = require('node:assert/strict');

function calculateDiscount(coupon, subtotal) {
  let discount = coupon.discount_type === 'percent'
    ? Number(subtotal) * Number(coupon.discount_value) / 100
    : Number(coupon.discount_value);
  if (coupon.max_discount_amount !== null) {
    discount = Math.min(discount, Number(coupon.max_discount_amount));
  }
  discount = Math.min(discount, Number(subtotal));
  return Math.max(0, Number(discount.toFixed(2)));
}

test('percent coupon respects max discount cap', () => {
  const discount = calculateDiscount({
    discount_type: 'percent',
    discount_value: 50,
    max_discount_amount: 100,
  }, 500);
  assert.equal(discount, 100);
});

test('fixed coupon cannot exceed subtotal', () => {
  const discount = calculateDiscount({
    discount_type: 'fixed',
    discount_value: 200,
    max_discount_amount: null,
  }, 150);
  assert.equal(discount, 150);
});
