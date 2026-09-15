const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');

const router = express.Router();

const invoiceItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotal: z.number().nonnegative(),
});

const invoiceSyncSchema = z.object({
  orderId: z.number().int().positive(),
  sessionToken: z.string().min(10),
  tableId: z.number().int().positive(),
  restaurantId: z.number().int().positive(),
  tableNumber: z.union([z.string().min(1), z.number()]),
  customerName: z.string().optional().default(''),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'cod']).default('paid'),
  timestamp: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  items: z.array(invoiceItemSchema).min(1),
});

router.post('/sync', asyncHandler(async (req, res) => {
  const data = invoiceSyncSchema.parse({
    ...req.body,
    orderId: Number(req.body.orderId),
    tableId: Number(req.body.tableId),
    restaurantId: Number(req.body.restaurantId),
    totalAmount: Number(req.body.totalAmount),
  });

  const tableNumber = String(data.tableNumber).trim();

  const { rows: orderRows } = await pool.query(
    `SELECT o.id, o.restaurant_id, o.table_id, o.table_number, o.customer_name, o.payment_method,
            payment_status, total_amount, created_at
     FROM orders o
     INNER JOIN table_sessions s ON s.id = o.table_session_id
     WHERE o.id = $1 AND s.session_token = $2 LIMIT 1`,
    [data.orderId, data.sessionToken]
  );

  if (!orderRows.length) {
    return res.status(404).json({ message: 'Order not found' });
  }

  if (Number(orderRows[0].restaurant_id) !== data.restaurantId || Number(orderRows[0].table_id) !== data.tableId) {
    return res.status(409).json({ message: 'Invoice payload does not match order context' });
  }

  const { rows: itemRows } = await pool.query(
    `SELECT menu_item_id, item_name AS name, item_price AS price, quantity, line_total
     FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
    [data.orderId]
  );

  const paymentStatus = orderRows[0].payment_status === 'paid'
    ? 'paid'
    : (orderRows[0].payment_method === 'cash' || orderRows[0].payment_method === 'cod' ? 'cod' : orderRows[0].payment_status);
  const serverTotal = Number(orderRows[0].total_amount);
  const payload = {
    orderId: data.orderId,
    tableId: orderRows[0].table_id,
    restaurantId: orderRows[0].restaurant_id,
    tableNumber: orderRows[0].table_number,
    customerName: orderRows[0].customer_name || '',
    paymentStatus,
    timestamp: orderRows[0].created_at,
    totalAmount: serverTotal,
    items: itemRows,
  };

  const result = await pool.query(
    `INSERT INTO invoice_syncs (
      restaurant_id, table_id, order_id, table_number, customer_name,
      payment_status, total_amount, items_json, invoice_payload, synced_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, TO_TIMESTAMP($10), CURRENT_TIMESTAMP)
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
     RETURNING id, synced_at`,
    [
      data.restaurantId,
      data.tableId,
      data.orderId,
      orderRows[0].table_number,
      orderRows[0].customer_name || '',
      paymentStatus,
      serverTotal,
      JSON.stringify(itemRows),
      JSON.stringify(payload),
      Math.floor(new Date(orderRows[0].created_at).getTime() / 1000),
    ]
  );

  return res.status(201).json({
    message: 'Invoice synced',
    invoiceId: result.rows[0].id,
    syncedAt: result.rows[0].synced_at,
  });
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin', 'staff', 'kitchen']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, restaurant_id, table_id, order_id, table_number, customer_name, payment_status,
            total_amount, items_json, invoice_payload, synced_at, updated_at
     FROM invoice_syncs
     WHERE restaurant_id = $1
     ORDER BY synced_at DESC, id DESC
     LIMIT 100`,
    [restaurantId]
  );

  return res.json({ invoices: rows });
}));

module.exports = router;