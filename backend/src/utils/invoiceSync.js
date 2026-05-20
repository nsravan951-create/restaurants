const pool = require('../config/db');
const { emitInvoiceCreated } = require('../services/socket');

async function syncInvoiceForOrder(orderId) {
  const { rows: orderRows } = await pool.query(
    `SELECT o.id, o.restaurant_id, o.table_id, o.table_number, o.customer_name,
            o.total_amount, o.payment_method, o.payment_status, o.created_at
     FROM orders o
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  );

  if (!orderRows.length) return null;

  const order = orderRows[0];
  const { rows: itemRows } = await pool.query(
    `SELECT menu_item_id, item_name, item_price, quantity, line_total
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  const items = itemRows.map((row) => ({
    menuItemId: row.menu_item_id,
    name: row.item_name,
    price: Number(row.item_price),
    quantity: Number(row.quantity),
    lineTotal: Number(row.line_total),
  }));

  const paymentStatus = order.payment_status === 'paid'
    ? 'paid'
    : (order.payment_method === 'cod' ? 'cod' : order.payment_status);

  const payload = {
    orderId: order.id,
    tableId: order.table_id,
    restaurantId: order.restaurant_id,
    tableNumber: order.table_number,
    customerName: order.customer_name || 'Guest',
    paymentStatus,
    timestamp: order.created_at,
    totalAmount: Number(order.total_amount),
    items,
  };

  const result = await pool.query(
    `INSERT INTO invoice_syncs (
      restaurant_id, table_id, order_id, table_number, customer_name,
      payment_status, total_amount, items_json, invoice_payload, synced_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (order_id)
     DO UPDATE SET
       table_number = EXCLUDED.table_number,
       customer_name = EXCLUDED.customer_name,
       payment_status = EXCLUDED.payment_status,
       total_amount = EXCLUDED.total_amount,
       items_json = EXCLUDED.items_json,
       invoice_payload = EXCLUDED.invoice_payload,
       synced_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      order.restaurant_id,
      order.table_id,
      order.id,
      order.table_number,
      order.customer_name || '',
      paymentStatus,
      order.total_amount,
      JSON.stringify(items),
      JSON.stringify(payload),
    ]
  );

  try {
    emitInvoiceCreated(order.restaurant_id, {
      invoiceId: result.rows[0].id,
      orderId: order.id,
      tableNumber: order.table_number,
    });
  } catch (error) {
    // non-fatal
  }

  return payload;
}

module.exports = { syncInvoiceForOrder };
