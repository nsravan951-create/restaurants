const pool = require('../config/db');

async function recordChargeableOrder(orderId) {
  const { rows: orderRows } = await pool.query(
    `SELECT id, restaurant_id, total_amount
     FROM orders
     WHERE id = $1 AND payment_status = 'paid'
     LIMIT 1`,
    [orderId]
  );
  if (!orderRows.length) return null;

  const order = orderRows[0];
  const { rows: ruleRows } = await pool.query(
    `SELECT commission_type, commission_value
     FROM commission_rules
     WHERE status = 'active'
       AND (restaurant_id = $1 OR restaurant_id IS NULL)
       AND effective_from <= CURRENT_TIMESTAMP
       AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
     ORDER BY restaurant_id NULLS LAST, effective_from DESC, id DESC
     LIMIT 1`,
    [order.restaurant_id]
  );
  const rule = ruleRows[0];
  if (!rule || rule.commission_type === 'subscription') return null;

  const chargeAmount = rule.commission_type === 'percentage'
    ? Number(order.total_amount) * Number(rule.commission_value) / 100
    : Number(rule.commission_value);

  const { rows } = await pool.query(
    `INSERT INTO chargeable_order_ledger
       (order_id, restaurant_id, charge_amount, order_amount, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id, charge_amount`,
    [order.id, order.restaurant_id, chargeAmount.toFixed(2), order.total_amount, rule.commission_type]
  );
  if (!rows.length) return null;

  await pool.query(
    `INSERT INTO financial_ledger_entries
       (restaurant_id, order_id, entry_type, amount, description)
     VALUES ($1, $2, 'commission', $3, $4)`,
    [order.restaurant_id, order.id, rows[0].charge_amount, `Commission: ${rule.commission_type}`]
  );
  return rows[0];
}

module.exports = { recordChargeableOrder };
