const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission } = require('../middleware/platformPermissions');

const router = express.Router();

router.use(requireAuth());
router.use(requirePlatformPermission('finance.read'));

router.get('/transactions', asyncHandler(async (req, res) => {
  const search = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const restaurantId = Number(req.query.restaurantId || 0);
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (restaurantId > 0) {
    conditions.push(`o.restaurant_id = $${idx++}`);
    params.push(restaurantId);
  }
  if (status) {
    conditions.push(`o.payment_status = $${idx++}`);
    params.push(status);
  }
  if (search) {
    conditions.push(`(
      CAST(o.id AS TEXT) ILIKE $${idx}
      OR pt.provider_order_id ILIKE $${idx}
      OR pt.provider_payment_id ILIKE $${idx}
      OR r.name ILIKE $${idx}
      OR o.invoice_number ILIKE $${idx}
    )`);
    params.push(`%${search}%`);
    idx += 1;
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT
       o.id AS order_id,
       o.invoice_number,
       o.restaurant_id,
       r.name AS restaurant_name,
       o.total_amount AS gross_amount,
       o.payment_status,
       o.payment_method,
       o.payment_provider,
       o.created_at,
       pt.provider_order_id AS cashfree_order_id,
       pt.provider_payment_id AS cashfree_payment_id,
       pt.status AS provider_status,
       pt.amount AS provider_amount,
       col.charge_amount AS commission_amount,
       (o.total_amount - COALESCE(col.charge_amount, 0))::numeric AS restaurant_amount,
       col.status AS commission_status
     FROM orders o
     INNER JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN payment_transactions pt ON pt.order_id = o.id
     LEFT JOIN chargeable_order_ledger col ON col.order_id = o.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: summary } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS gross_paid,
       COALESCE(SUM(col.charge_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS total_commission,
       COALESCE(SUM(o.total_amount - COALESCE(col.charge_amount, 0)) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric AS net_to_restaurants
     FROM orders o
     LEFT JOIN chargeable_order_ledger col ON col.order_id = o.id
     WHERE ${conditions.slice(0, conditions.length).join(' AND ')}`,
    params.slice(0, params.length - 2)
  );

  return res.json({ transactions: rows, summary: summary[0], limit, offset });
}));

router.get('/ledger', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.query.restaurantId || 0);
  const params = [];
  let filter = '';
  if (restaurantId > 0) {
    filter = 'WHERE fle.restaurant_id = $1';
    params.push(restaurantId);
  }

  const { rows } = await pool.query(
    `SELECT fle.id, fle.restaurant_id, r.name AS restaurant_name, fle.order_id,
            fle.entry_type, fle.amount, fle.description, fle.created_at
     FROM financial_ledger_entries fle
     LEFT JOIN restaurants r ON r.id = fle.restaurant_id
     ${filter}
     ORDER BY fle.created_at DESC
     LIMIT 200`,
    params
  );
  return res.json({ entries: rows });
}));

router.get('/commission-rules', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cr.*, r.name AS restaurant_name
     FROM commission_rules cr
     LEFT JOIN restaurants r ON r.id = cr.restaurant_id
     ORDER BY cr.effective_from DESC, cr.id DESC`
  );
  return res.json({ rules: rows });
}));

module.exports = router;
