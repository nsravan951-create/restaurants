const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');
const { buildQrPayload } = require('../utils/qr');
const { expireInactiveSessions } = require('../utils/tableSession');

const router = express.Router();

const tableSchema = z.object({
  tableNumber: z.string().min(1),
});

const autoTableSchema = z.object({
  totalTables: z.number().int().positive().max(500),
});

router.param('restaurantId', (req, res, next, restaurantId) => {
  if (!/^\d+$/.test(String(restaurantId))) {
    return res.status(400).json({ error: 'Invalid restaurant ID' });
  }
  return next();
});

router.get('/owner/me', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, slug, phone, address, is_active FROM restaurants WHERE owner_user_id = $1 LIMIT 1', [req.user.userId]);
  if (!rows.length) return res.status(404).json({ message: 'Restaurant not found' });
  return res.json({ restaurant: rows[0] });
}));

router.get('/:restaurantId/tables', requireAuth(['owner', 'super_admin', 'staff', 'kitchen']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);
  await expireInactiveSessions();

  const { rows } = await pool.query(
    `SELECT t.id, t.table_number, t.availability_status, t.qr_token, q.qr_url, q.qr_data_url, t.created_at
     FROM restaurant_tables t
     LEFT JOIN qr_codes q ON q.table_id = t.id
     WHERE t.restaurant_id = $1
     ORDER BY t.table_number ASC`,
    [restaurantId]
  );

  return res.json({ tables: rows });
}));

router.get('/:restaurantId/tables/resolve', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const tableParam = String(req.query.table || req.query.tableNumber || '').trim();

  if (!tableParam) {
    return res.status(400).json({ error: 'table or tableNumber query is required' });
  }

  const normalized = /^\d+$/.test(tableParam) ? [`Table ${tableParam}`, tableParam] : [tableParam];
  const placeholders = normalized.map((_, index) => `$${index + 2}`).join(', ');
  const { rows } = await pool.query(
    `SELECT id, table_number
     FROM restaurant_tables
     WHERE restaurant_id = $1 AND table_number IN (${placeholders})
     ORDER BY id ASC
     LIMIT 1`,
    [restaurantId, ...normalized]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Table not found' });
  }

  return res.json({ table: rows[0] });
}));

router.post('/:restaurantId/tables', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const data = tableSchema.parse(req.body);
  await ensureRestaurantAccess(req.user, restaurantId);

  const token = `${restaurantId}-${data.tableNumber}-${Date.now()}`;

  const result = await pool.query(
    'INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token) VALUES ($1, $2, $3) RETURNING id',
    [restaurantId, data.tableNumber, token]
  );
  const tableId = result.rows[0].id;

  const { qrUrl, qrDataUrl } = await buildQrPayload({
    restaurantId: Number(restaurantId),
    tableId,
    tableNumber: data.tableNumber,
  });

  await pool.query(
    `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
     VALUES ($1, $2, $3, $4)`,
    [restaurantId, tableId, qrUrl, qrDataUrl]
  );

  return res.status(201).json({
    message: 'Table created',
    table: {
      id: tableId,
      restaurant_id: Number(restaurantId),
      table_number: data.tableNumber,
      availability_status: 'available',
      qr_token: token,
      qr_url: qrUrl,
      qr_data_url: qrDataUrl,
    },
  });
}));

router.post('/:restaurantId/auto-generate-tables', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const data = autoTableSchema.parse({
    ...req.body,
    totalTables: Number(req.body.totalTables),
  });

  const conn = await pool.connect();
  let createdCount = 0;

  try {
    await conn.query('BEGIN');

    const { rows: existingRows } = await conn.query(
      'SELECT table_number FROM restaurant_tables WHERE restaurant_id = $1',
      [restaurantId]
    );
    const existingSet = new Set(existingRows.map((row) => row.table_number));

    for (let i = 1; i <= data.totalTables; i += 1) {
      const tableNumber = `Table ${i}`;
      if (existingSet.has(tableNumber)) continue;

      const token = `${restaurantId}-${tableNumber.replace(/\s+/g, '-')}-${Date.now()}-${i}`;
      const tableResult = await conn.query(
        'INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token) VALUES ($1, $2, $3) RETURNING id',
        [restaurantId, tableNumber, token]
      );
      const tableId = tableResult.rows[0].id;

      const { qrUrl, qrDataUrl } = await buildQrPayload({
        restaurantId: Number(restaurantId),
        tableId,
        tableNumber,
      });

      await conn.query(
        `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
         VALUES ($1, $2, $3, $4)`,
        [restaurantId, tableId, qrUrl, qrDataUrl]
      );

      createdCount += 1;
    }

    await conn.query('COMMIT');
    return res.json({ message: 'Tables generated successfully', createdCount });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.post('/:restaurantId/generate-qrs', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const tableCount = Number(req.body.tableCount);
  if (!Number.isInteger(tableCount) || tableCount <= 0 || tableCount > 500) {
    return res.status(400).json({ error: 'tableCount must be an integer between 1 and 500' });
  }

  const conn = await pool.connect();
  const generated = [];

  try {
    await conn.query('BEGIN');

    const { rows: existingRows } = await conn.query(
      'SELECT table_number FROM restaurant_tables WHERE restaurant_id = $1',
      [restaurantId]
    );
    const existingSet = new Set(existingRows.map((row) => row.table_number));

    for (let i = 1; i <= tableCount; i += 1) {
      const tableNumber = `Table ${i}`;
      if (existingSet.has(tableNumber)) continue;

      const token = `${restaurantId}-${tableNumber.replace(/\s+/g, '-')}-${Date.now()}-${i}`;
      const tableResult = await conn.query(
        'INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token) VALUES ($1, $2, $3) RETURNING id',
        [restaurantId, tableNumber, token]
      );
      const tableId = tableResult.rows[0].id;

      const { qrUrl, qrDataUrl } = await buildQrPayload({
        restaurantId: Number(restaurantId),
        tableId,
        tableNumber,
      });

      await conn.query(
        `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
         VALUES ($1, $2, $3, $4)`,
        [restaurantId, tableId, qrUrl, qrDataUrl]
      );

      generated.push({ tableId, tableNumber, qrCodeUrl: qrUrl });
    }

    const { rows: exactRows } = await conn.query(
      `SELECT rt.id, rt.table_number, COALESCE(q.qr_url, '') AS qr_url, COALESCE(q.qr_data_url, '') AS qr_data_url
       FROM restaurant_tables rt
       LEFT JOIN qr_codes q ON q.table_id = rt.id
       WHERE rt.restaurant_id = $1
         AND rt.table_number = ANY($2::text[])
       ORDER BY rt.id ASC`,
      [restaurantId, Array.from({ length: tableCount }, (_, index) => `Table ${index + 1}`)]
    );

    await conn.query('COMMIT');
    return res.json({
      message: 'QR generation completed',
      restaurantId: Number(restaurantId),
      generatedCount: exactRows.length,
      tables: exactRows,
    });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.delete('/:restaurantId/tables/:tableId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId, tableId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  await pool.query('DELETE FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2', [tableId, restaurantId]);
  return res.json({ message: 'Table deleted' });
}));

router.get('/:restaurantId/tables/:tableId/qr', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { restaurantId, tableId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query('SELECT id FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2', [tableId, restaurantId]);
  if (!rows.length) return res.status(404).json({ message: 'Table not found' });

  const qrResult = await pool.query(
    'SELECT qr_url, qr_data_url FROM qr_codes WHERE restaurant_id = $1 AND table_id = $2 LIMIT 1',
    [restaurantId, tableId]
  );
  let qrRows = qrResult.rows;

  if (!qrRows.length) {
    const { qrUrl, qrDataUrl } = await buildQrPayload({
      restaurantId: Number(restaurantId),
      tableId: Number(tableId),
      tableNumber: rows[0].table_number,
    });
    await pool.query(
      `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
       VALUES ($1, $2, $3, $4)`,
      [restaurantId, tableId, qrUrl, qrDataUrl]
    );
    qrRows = [{ qr_url: qrUrl, qr_data_url: qrDataUrl }];
  }

  return res.json({
    url: qrRows[0].qr_url,
    qrDataUrl: qrRows[0].qr_data_url,
    downloadName: `restaurant-${restaurantId}-table-${tableId}.png`,
  });
}));

router.get('/:restaurantId/table/:tableId', asyncHandler(async (req, res) => {
  const { restaurantId, tableId } = req.params;
  await expireInactiveSessions();

  const { rows: restaurantRows } = await pool.query(
    'SELECT id, name, slug FROM restaurants WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [restaurantId]
  );

  if (!restaurantRows.length) {
    return res.status(404).json({ message: 'Restaurant not found' });
  }

  const { rows: tableRows } = await pool.query(
    'SELECT id, table_number, availability_status FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
    [tableId, restaurantId]
  );

  if (!tableRows.length) {
    return res.status(404).json({ message: 'Table not found' });
  }

  const { rows: menuRows } = await pool.query(
    'SELECT id, name, description, price, image_url, category FROM menu_items WHERE restaurant_id = $1 AND is_available = TRUE ORDER BY category, name',
    [restaurantId]
  );

  const { rows: adsRows } = await pool.query(
    `SELECT id, title, image_url, target_link
     FROM ads
     WHERE is_active = TRUE
       AND (restaurant_id IS NULL OR restaurant_id = $1)
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
     ORDER BY id DESC`,
    [restaurantId]
  );

  const { rows: activeSessionRows } = await pool.query(
    `SELECT id, expires_at
     FROM table_sessions
     WHERE restaurant_id = $1 AND table_id = $2 AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [restaurantId, tableId]
  );

  return res.json({
    restaurant: restaurantRows[0],
    table: tableRows[0],
    lock: {
      isLocked: activeSessionRows.length > 0,
      expiresAt: activeSessionRows[0]?.expires_at || null,
    },
    menu: menuRows,
    ads: adsRows,
  });
}));

module.exports = router;
