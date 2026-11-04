const pool = require('../config/db');
const { writeAuditLog } = require('./auditLog');

async function consumeRecipesForOrder(orderId, actorUserId = null) {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: orderRows } = await conn.query(
      `SELECT id, restaurant_id
       FROM orders
       WHERE id = $1 AND payment_status = 'paid'
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );
    if (!orderRows.length) {
      await conn.query('ROLLBACK');
      return { consumed: false, reason: 'order_not_paid' };
    }

    const order = orderRows[0];
    const { rows: requirements } = await conn.query(
      `SELECT oi.menu_item_id, oi.quantity AS order_quantity,
              ri.ingredient_id, ri.quantity AS recipe_quantity,
              i.name, i.unit, i.current_stock
       FROM order_items oi
       INNER JOIN recipes r ON r.menu_item_id = oi.menu_item_id AND r.restaurant_id = $2
       INNER JOIN recipe_items ri ON ri.recipe_id = r.id
       INNER JOIN ingredients i ON i.id = ri.ingredient_id AND i.restaurant_id = $2
       WHERE oi.order_id = $1
       FOR UPDATE OF i`,
      [orderId, order.restaurant_id]
    );
    if (!requirements.length) {
      await conn.query('COMMIT');
      return { consumed: false, reason: 'no_recipes' };
    }

    const totals = new Map();
    for (const row of requirements) {
      const current = totals.get(row.ingredient_id) || { ...row, required: 0 };
      current.required += Number(row.recipe_quantity) * Number(row.order_quantity);
      totals.set(row.ingredient_id, current);
    }
    const insufficient = [...totals.values()].filter((item) => Number(item.current_stock) < item.required);
    if (insufficient.length) {
      await conn.query('ROLLBACK');
      await writeAuditLog({
        actorUserId,
        restaurantId: order.restaurant_id,
        action: 'recipe_consumption_blocked',
        resourceType: 'order',
        resourceId: orderId,
        metadata: { ingredients: insufficient.map((item) => ({ id: item.ingredient_id, name: item.name, required: item.required, available: item.current_stock })) },
      });
      return { consumed: false, reason: 'insufficient_stock', insufficient };
    }

    for (const item of totals.values()) {
      const idempotencyKey = `order:${orderId}:ingredient:${item.ingredient_id}`;
      const { rows: insertedRows } = await conn.query(
        `INSERT INTO inventory_transactions
           (restaurant_id, ingredient_id, transaction_type, quantity, unit, reference_type, reference_id, idempotency_key, notes, created_by_user_id)
         VALUES ($1, $2, 'consumption', $3, $4, 'order', $5, $6, $7, $8)
         ON CONFLICT (restaurant_id, idempotency_key) DO NOTHING`,
        [order.restaurant_id, item.ingredient_id, item.required, item.unit, orderId, idempotencyKey, `Recipe consumption for order #${orderId}`, actorUserId]
      );
      if (!insertedRows.length) continue;
      await conn.query(
        `UPDATE ingredients
         SET current_stock = current_stock - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND restaurant_id = $3`,
        [item.required, item.ingredient_id, order.restaurant_id]
      );
    }
    await conn.query('COMMIT');
    await writeAuditLog({
      actorUserId,
      restaurantId: order.restaurant_id,
      action: 'recipe_consumption_recorded',
      resourceType: 'order',
      resourceId: orderId,
      metadata: { ingredients: [...totals.values()].map((item) => ({ id: item.ingredient_id, quantity: item.required })) },
    });
    return { consumed: true, ingredientCount: totals.size };
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { consumeRecipesForOrder };
