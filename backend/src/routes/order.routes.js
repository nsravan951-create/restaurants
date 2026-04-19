const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ensureRestaurantAccess } = require('../utils/access');
const { emitOrderUpdate } = require('../services/socket');
const { expireInactiveSessions, getSessionExpiryDate, endSessionByOrderId } = require('../utils/tableSession');
const { buildInvoiceModel, renderInvoiceHtml, buildInvoicePdf } = require('../utils/invoice');

const router = express.Router();

const createOrderSchema = z.object({
  restaurantId: z.number(),
  tableId: z.number(),
  tableSessionId: z.number().int().positive(),
  sessionToken: z.string().min(10),
  customerName: z.string().optional().default(''),
  paymentMethod: z.enum(['online', 'cod']),
  items: z.array(z.object({
    menuItemId: z.number(),
    itemPrice: z.number().positive(),
    quantity: z.number().int().positive(),
  })).min(1),
  notes: z.string().optional().default(''),
});

router.post('/', asyncHandler(async (req, res) => {
  await expireInactiveSessions();

  if (req.body && req.body.sessionId && !req.body.tableSessionId) {
    const sessionId = Number(req.body.sessionId);
    const { rows: sessionRows } = await pool.query(
      `SELECT id, restaurant_id, table_id, session_token, status
       FROM table_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRows.length) {
      return res.status(404).json({ message: 'Session not found' });
    }
    if (sessionRows[0].status !== 'active') {
      return res.status(409).json({ message: 'Session is no longer active' });
    }

    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const itemNames = [...new Set(rawItems.map((item) => String(item.name || '').trim().toLowerCase()).filter(Boolean))];
    if (!itemNames.length) {
      return res.status(400).json({ message: 'items are required' });
    }

    const placeholders = itemNames.map((_, index) => `$${index + 2}`).join(', ');
    const { rows: menuRows } = await pool.query(
      `SELECT id, name, price
       FROM menu_items
       WHERE restaurant_id = $1 AND LOWER(name) IN (${placeholders})`,
      [sessionRows[0].restaurant_id, ...itemNames]
    );
    const menuByName = new Map(menuRows.map((row) => [String(row.name).trim().toLowerCase(), row]));

    const normalizedItems = rawItems.map((item) => {
      const menu = menuByName.get(String(item.name || '').trim().toLowerCase());
      if (!menu) {
        return null;
      }
      const quantity = Number(item.qty || item.quantity || 1);
      return {
        menuItemId: menu.id,
        itemPrice: Number(item.price || menu.price),
        quantity,
      };
    }).filter(Boolean);

    if (!normalizedItems.length) {
      return res.status(400).json({ message: 'No valid menu items found' });
    }

    req.body = {
      restaurantId: sessionRows[0].restaurant_id,
      tableId: sessionRows[0].table_id,
      tableSessionId: sessionRows[0].id,
      sessionToken: sessionRows[0].session_token,
      customerName: req.body.customerName || '',
      paymentMethod: req.body.paymentMethod || 'cod',
      notes: req.body.notes || '',
      items: normalizedItems,
    };
  }

  const data = createOrderSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    tableId: Number(req.body.tableId),
    tableSessionId: Number(req.body.tableSessionId),
    items: (req.body.items || []).map((item) => ({
      menuItemId: Number(item.menuItemId),
      itemPrice: Number(item.itemPrice),
      quantity: Number(item.quantity),
    })),
  });

  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows: tableRows } = await conn.query(
      'SELECT id, table_number FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
      [data.tableId, data.restaurantId]
    );

    if (!tableRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found for restaurant' });
    }

    const { rows: sessionRows } = await conn.query(
      `SELECT id, status, session_token
       FROM table_sessions
       WHERE id = $1 AND table_id = $2 AND restaurant_id = $3
       LIMIT 1
       FOR UPDATE`,
      [data.tableSessionId, data.tableId, data.restaurantId]
    );

    if (!sessionRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Table session not found' });
    }

    if (sessionRows[0].status !== 'active' || sessionRows[0].session_token !== data.sessionToken) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ message: 'This table is currently in ordering session with a different lock' });
    }

    const { rows: existingOrderRows } = await conn.query(
      'SELECT id FROM orders WHERE table_session_id = $1 LIMIT 1 FOR UPDATE',
      [data.tableSessionId]
    );

    if (existingOrderRows.length) {
      await conn.query('ROLLBACK');
      return res.status(409).json({
        message: 'An order is already placed for this active table session',
        orderId: existingOrderRows[0].id,
      });
    }


    const menuItemIds = [...new Set(data.items.map((item) => item.menuItemId))];
    const { rows: menuRows } = await conn.query(
      `SELECT id, name, price
       FROM menu_items
       WHERE restaurant_id = $1 AND id IN (${menuItemIds.map((_, index) => `$${index + 2}`).join(',')}) AND is_available = TRUE`,
      [data.restaurantId, ...menuItemIds]
    );

    const menuMap = new Map(menuRows.map((row) => [row.id, row]));

    let total = 0;
    const orderItems = data.items.map((item) => {
      const menu = menuMap.get(item.menuItemId);
      if (!menu) {
        const err = new Error('Some items are invalid or unavailable');
        err.status = 400;
        throw err;
      }
      const lockedPrice = Number(item.itemPrice);
      const lineTotal = lockedPrice * item.quantity;
      total += lineTotal;
      return {
        menuItemId: item.menuItemId,
        itemName: menu.name,
        quantity: item.quantity,
        itemPrice: lockedPrice,
        unitPrice: lockedPrice,
        lineTotal,
      };
    });

    const orderResult = await conn.query(
      `INSERT INTO orders (restaurant_id, table_id, table_session_id, table_number, customer_name, total_amount, status, payment_method, payment_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, 'pending', $8) RETURNING id` ,
      [data.restaurantId, data.tableId, data.tableSessionId, tableRows[0].table_number, data.customerName, total, data.paymentMethod, data.notes]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of orderItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.menuItemId, item.itemName, item.itemPrice, item.quantity, item.unitPrice, item.lineTotal]
      );
    }

    const nextExpiry = getSessionExpiryDate();
    await conn.query(
      'UPDATE table_sessions SET last_activity_at = NOW(), expires_at = $1 WHERE id = $2',
      [nextExpiry, data.tableSessionId]
    );

    await conn.query('COMMIT');

    emitOrderUpdate(data.restaurantId, {
      type: 'created',
      orderId,
      tableId: data.tableId,
      status: 'pending',
    });

    return res.status(201).json({
      message: 'Order placed successfully',
      orderId,
      totalAmount: total,
    });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.get('/active', asyncHandler(async (req, res) => {
  const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;

  let query = `
    SELECT o.id, o.restaurant_id, o.table_id, o.table_number, o.status, o.total_amount, o.created_at,
      COALESCE(json_agg(json_build_object('id', oi.id, 'item_name', oi.item_name, 'item_price', oi.item_price, 'quantity', oi.quantity, 'line_total', oi.line_total) ORDER BY oi.id), '[]'::json) AS items
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('pending', 'preparing', 'ready')
  `;
  const params = [];
  if (restaurantId) {
    query += ' AND o.restaurant_id = $1';
    params.push(restaurantId);
  }
  query += ' GROUP BY o.id ORDER BY o.created_at DESC';

  const { rows } = await pool.query(query, params);
  return res.json({ orders: rows });
}));

router.get('/restaurant/:restaurantId', requireAuth(['owner', 'super_admin', 'kitchen', 'staff']), asyncHandler(async (req, res) => {
  await expireInactiveSessions();

  const { restaurantId } = req.params;
  const { status } = req.query;

  await ensureRestaurantAccess(req.user, restaurantId);

  let query = `
          SELECT o.id, o.table_id, o.table_number, o.table_session_id, o.customer_name, o.total_amount, o.status, o.payment_method, o.payment_status, o.created_at,
            COALESCE(json_agg(json_build_object('id', oi.id, 'menu_item_id', oi.menu_item_id, 'item_name', oi.item_name, 'item_price', oi.item_price, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total) ORDER BY oi.id), '[]'::json) AS items
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = $1
  `;

  const params = [restaurantId];
  if (status) {
    query += ' AND o.status = $2';
    params.push(status);
  }

  query += ' GROUP BY o.id ORDER BY o.created_at DESC';

  const { rows } = await pool.query(query, params);
  return res.json({ orders: rows });
}));

router.patch('/:orderId/status', requireAuth(['owner', 'super_admin', 'kitchen', 'staff']), asyncHandler(async (req, res) => {
  await expireInactiveSessions();

  const { orderId } = req.params;
  const { status } = req.body;

  if (!['pending', 'preparing', 'ready', 'delivered'].includes(status)) {
    return res.status(400).json({ message: 'Invalid order status' });
  }

  const { rows } = await pool.query('SELECT id, restaurant_id FROM orders WHERE id = $1', [orderId]);
  if (!rows.length) return res.status(404).json({ message: 'Order not found' });

  await ensureRestaurantAccess(req.user, rows[0].restaurant_id);

  if (req.user.role === 'kitchen' && status === 'delivered') {
    return res.status(403).json({ message: 'Kitchen cannot mark delivered' });
  }

  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);

  if (status === 'delivered') {
    await endSessionByOrderId(orderId, 'order_delivered');
  }

  emitOrderUpdate(rows[0].restaurant_id, {
    type: 'status_changed',
    orderId: Number(orderId),
    status,
  });

  return res.json({ message: 'Order status updated' });
}));

router.get('/:orderId/invoice', requireAuth(['owner', 'super_admin', 'kitchen', 'staff']), asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const format = (req.query.format || 'html').toLowerCase();

  const { rows: orderRows } = await pool.query(
    'SELECT id, restaurant_id, table_number, customer_name, total_amount, status, payment_method, payment_status, created_at FROM orders WHERE id = $1 LIMIT 1',
    [orderId]
  );

  if (!orderRows.length) {
    return res.status(404).json({ message: 'Order not found' });
  }

  await ensureRestaurantAccess(req.user, orderRows[0].restaurant_id);

  const { rows: restaurantRows } = await pool.query(
    'SELECT id, name FROM restaurants WHERE id = $1 LIMIT 1',
    [orderRows[0].restaurant_id]
  );

  const { rows: itemRows } = await pool.query(
    `SELECT item_name, item_price, quantity, line_total
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  const model = buildInvoiceModel(orderRows[0], restaurantRows[0], itemRows);

  if (format === 'pdf') {
    return buildInvoicePdf(res, model);
  }

  return res.send(renderInvoiceHtml(model));
}));

router.get('/:orderId/invoice-data', requireAuth(['owner', 'super_admin', 'kitchen', 'staff']), asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const { rows: orderRows } = await pool.query(
    'SELECT id, restaurant_id, table_number, customer_name, total_amount, status, payment_method, payment_status, created_at FROM orders WHERE id = $1 LIMIT 1',
    [orderId]
  );

  if (!orderRows.length) {
    return res.status(404).json({ message: 'Order not found' });
  }

  await ensureRestaurantAccess(req.user, orderRows[0].restaurant_id);

  const { rows: restaurantRows } = await pool.query(
    'SELECT id, name FROM restaurants WHERE id = $1 LIMIT 1',
    [orderRows[0].restaurant_id]
  );

  const { rows: itemRows } = await pool.query(
    `SELECT item_name, item_price, quantity, line_total
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  const model = buildInvoiceModel(orderRows[0], restaurantRows[0], itemRows);
  return res.json({ invoice: model });
}));

module.exports = router;
