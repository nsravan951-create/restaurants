const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Require super_admin for all messaging routes
router.use(requireAuth(['super_admin']));

// POST /api/admin/messages - Create a message
router.post('/', asyncHandler(async (req, res) => {
  const { title, content, messageType, priority, recipientType, recipientIds, isBroadcast, expiresAt } = req.body;
  const superAdminId = req.user.id;

  if (!title || !content || !messageType || !recipientType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Create the message
  const { rows: messageRows } = await pool.query(
    `INSERT INTO admin_messages (title, content, message_type, priority, recipient_type, is_broadcast, created_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, title, content, message_type, priority, recipient_type, is_broadcast, created_at`,
    [title, content, messageType || 'announcement', priority || 'normal', recipientType, isBroadcast || false, superAdminId, expiresAt || null]
  );

  const message = messageRows[0];

  // Add recipients
  if (recipientType === 'all' && isBroadcast) {
    // Send to all active restaurants
    await pool.query(
      `INSERT INTO message_recipients (message_id, restaurant_id)
       SELECT $1, id FROM restaurants WHERE is_active = TRUE
       ON CONFLICT DO NOTHING`,
      [message.id]
    );
  } else if (recipientType === 'specific' && recipientIds && recipientIds.length > 0) {
    // Send to specific restaurants
    for (const restaurantId of recipientIds) {
      await pool.query(
        `INSERT INTO message_recipients (message_id, restaurant_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [message.id, restaurantId]
      );
    }
  } else if (recipientType === 'subscription_based') {
    // Send only to restaurants with active subscriptions
    await pool.query(
      `INSERT INTO message_recipients (message_id, restaurant_id)
       SELECT $1, id FROM restaurants WHERE subscription_status = 'active'
       ON CONFLICT DO NOTHING`,
      [message.id]
    );
  }

  // Get recipient count
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM message_recipients WHERE message_id = $1',
    [message.id]
  );

  return res.json({
    message: message,
    recipientCount: countRows[0]?.count || 0,
  });
}));

// GET /api/admin/messages - List messages
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = 'SELECT * FROM admin_messages WHERE 1=1';
  const params = [];

  if (type) {
    query += ' AND message_type = $' + (params.length + 1);
    params.push(type);
  }

  if (search) {
    query += ' AND (title ILIKE $' + (params.length + 1) + ' OR content ILIKE $' + (params.length + 2) + ')';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(parseInt(limit), offset);

  const { rows } = await pool.query(query, params);

  // Get recipient count for each message
  const messages = await Promise.all(
    rows.map(async (msg) => {
      const { rows: countRows } = await pool.query(
        'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_read = TRUE)::int AS read_count FROM message_recipients WHERE message_id = $1',
        [msg.id]
      );
      return {
        ...msg,
        recipientCount: countRows[0]?.total || 0,
        readCount: countRows[0]?.read_count || 0,
      };
    })
  );

  return res.json({ messages, page: parseInt(page), limit: parseInt(limit) });
}));

// GET /api/admin/messages/:id - Get single message
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows: messageRows } = await pool.query(
    'SELECT * FROM admin_messages WHERE id = $1',
    [id]
  );

  if (!messageRows.length) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const message = messageRows[0];

  // Get recipient details
  const { rows: recipientRows } = await pool.query(
    `SELECT mr.id, mr.restaurant_id, mr.is_read, mr.read_at, 
            r.name AS restaurant_name, r.slug
     FROM message_recipients mr
     JOIN restaurants r ON r.id = mr.restaurant_id
     WHERE mr.message_id = $1
     ORDER BY mr.created_at DESC`,
    [id]
  );

  return res.json({
    message,
    recipients: recipientRows,
    stats: {
      total: recipientRows.length,
      read: recipientRows.filter(r => r.is_read).length,
      unread: recipientRows.filter(r => !r.is_read).length,
    },
  });
}));

// PUT /api/admin/messages/:id - Update message
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content, priority, expiresAt } = req.body;

  const { rows } = await pool.query(
    `UPDATE admin_messages 
     SET title = COALESCE($1, title), content = COALESCE($2, content), priority = COALESCE($3, priority), expires_at = COALESCE($4, expires_at)
     WHERE id = $5
     RETURNING *`,
    [title || null, content || null, priority || null, expiresAt || null, id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Message not found' });
  }

  return res.json(rows[0]);
}));

// DELETE /api/admin/messages/:id - Delete message
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    'DELETE FROM admin_messages WHERE id = $1 RETURNING id',
    [id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Message not found' });
  }

  return res.json({ message: 'Message deleted' });
}));

// GET /api/admin/messages/:id/recipients - Get recipient status
router.get('/:id/recipients', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20, readStatus } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `SELECT mr.id, mr.restaurant_id, mr.is_read, mr.read_at, 
               r.name AS restaurant_name, r.slug, u.email AS owner_email
        FROM message_recipients mr
        JOIN restaurants r ON r.id = mr.restaurant_id
        LEFT JOIN users u ON u.id = r.owner_user_id
        WHERE mr.message_id = $1`;

  const params = [id];

  if (readStatus === 'read') {
    query += ' AND mr.is_read = TRUE';
  } else if (readStatus === 'unread') {
    query += ' AND mr.is_read = FALSE';
  }

  query += ` ORDER BY mr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), offset);

  const { rows } = await pool.query(query, params);

  return res.json({ recipients: rows, page: parseInt(page), limit: parseInt(limit) });
}));

module.exports = router;
