const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const {
  SESSION_TIMEOUT_MINUTES,
  generateSessionToken,
  expireInactiveSessions,
  getSessionExpiryDate,
} = require('../utils/tableSession');

const router = express.Router();

const startSessionSchema = z.object({
  restaurantId: z.number().int().positive(),
  tableId: z.number().int().positive(),
  clientId: z.string().min(6),
  joinExisting: z.boolean().optional().default(false),
  sessionToken: z.string().optional().default(''),
});

router.post('/start', asyncHandler(async (req, res) => {
  const data = startSessionSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    tableId: Number(req.body.tableId),
  });

  await expireInactiveSessions();

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows: tableRows } = await conn.query(
      'SELECT id, table_number FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1 FOR UPDATE',
      [data.tableId, data.restaurantId]
    );

    if (!tableRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }

    const { rows: activeRows } = await conn.query(
      `SELECT id, session_token, created_by_client_id, status, expires_at
       FROM table_sessions
       WHERE table_id = $1 AND restaurant_id = $2 AND status = 'active'
       ORDER BY id DESC LIMIT 1
       FOR UPDATE`,
      [data.tableId, data.restaurantId]
    );

    const existing = activeRows[0];

    if (existing) {
      if (data.sessionToken && data.sessionToken === existing.session_token) {
        const nextExpiry = getSessionExpiryDate();
        await conn.query(
          'UPDATE table_sessions SET last_activity_at = NOW(), expires_at = $1 WHERE id = $2',
          [nextExpiry, existing.id]
        );

        await conn.query('COMMIT');
        return res.json({
          locked: false,
          joined: true,
          message: 'Resumed existing session',
          session: {
            id: existing.id,
            sessionToken: existing.session_token,
            expiresAt: nextExpiry,
            timeoutMinutes: SESSION_TIMEOUT_MINUTES,
          },
        });
      }

      if (data.joinExisting) {
        const nextExpiry = getSessionExpiryDate();
        await conn.query(
          'UPDATE table_sessions SET last_activity_at = NOW(), expires_at = $1 WHERE id = $2',
          [nextExpiry, existing.id]
        );

        await conn.query('COMMIT');
        return res.json({
          locked: false,
          joined: true,
          message: 'Joined existing table order session',
          session: {
            id: existing.id,
            sessionToken: existing.session_token,
            expiresAt: nextExpiry,
            timeoutMinutes: SESSION_TIMEOUT_MINUTES,
          },
        });
      }

      await conn.query('ROLLBACK');
      return res.status(409).json({
        locked: true,
        message: 'This table is currently in ordering session. Please wait or join existing order.',
        session: {
          id: existing.id,
          expiresAt: existing.expires_at,
          timeoutMinutes: SESSION_TIMEOUT_MINUTES,
        },
      });
    }

    const sessionToken = generateSessionToken();
    const expiresAt = getSessionExpiryDate();

    const result = await conn.query(
      `INSERT INTO table_sessions (restaurant_id, table_id, session_token, created_by_client_id, status, last_activity_at, expires_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), $5) RETURNING id`,
      [data.restaurantId, data.tableId, sessionToken, data.clientId, expiresAt]
    );

    await conn.query(
      "UPDATE restaurant_tables SET availability_status = 'active' WHERE id = $1",
      [data.tableId]
    );

    await conn.query('COMMIT');

    return res.status(201).json({
      locked: false,
      joined: false,
      message: 'Table session started',
      session: {
        id: result.rows[0].id,
        sessionToken,
        expiresAt,
        timeoutMinutes: SESSION_TIMEOUT_MINUTES,
      },
    });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.post('/:sessionId/ping', asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { sessionToken } = req.body;

  if (!sessionToken) {
    return res.status(400).json({ message: 'sessionToken is required' });
  }

  await expireInactiveSessions();

  const { rows } = await pool.query(
    `SELECT id, status
     FROM table_sessions
     WHERE id = $1 AND session_token = $2
     LIMIT 1`,
    [sessionId, sessionToken]
  );

  if (!rows.length) {
    return res.status(404).json({ message: 'Session not found' });
  }

  if (rows[0].status !== 'active') {
    return res.status(409).json({ message: 'Session is no longer active' });
  }

  const expiresAt = getSessionExpiryDate();
  await pool.query(
    'UPDATE table_sessions SET last_activity_at = NOW(), expires_at = $1 WHERE id = $2',
    [expiresAt, sessionId]
  );

  return res.json({ message: 'Session refreshed', expiresAt, timeoutMinutes: SESSION_TIMEOUT_MINUTES });
}));

router.post('/:sessionId/end', asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { sessionToken, reason } = req.body;

  if (!sessionToken) {
    return res.status(400).json({ message: 'sessionToken is required' });
  }

  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT id, table_id, status
       FROM table_sessions
       WHERE id = $1 AND session_token = $2
       LIMIT 1
       FOR UPDATE`,
      [sessionId, sessionToken]
    );

    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Session not found' });
    }

    if (rows[0].status !== 'active') {
      await conn.query('COMMIT');
      return res.json({ message: 'Session already ended' });
    }

    await conn.query(
      `UPDATE table_sessions
       SET status = 'completed', ended_at = NOW(), ended_reason = $1
       WHERE id = $2`,
      [reason || 'manual_end', sessionId]
    );

    await conn.query(
      "UPDATE restaurant_tables SET availability_status = 'available' WHERE id = $1",
      [rows[0].table_id]
    );

    await conn.query('COMMIT');
    return res.json({ message: 'Session ended' });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

module.exports = router;
