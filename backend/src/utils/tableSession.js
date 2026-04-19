const crypto = require('crypto');
const pool = require('../config/db');

const SESSION_TIMEOUT_MINUTES = Number(process.env.TABLE_SESSION_TIMEOUT_MINUTES || 20);

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function expireInactiveSessions() {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows: expiredRows } = await conn.query(
      `SELECT id, table_id
       FROM table_sessions
       WHERE status = 'active' AND expires_at <= NOW()
       FOR UPDATE`
    );

    if (expiredRows.length) {
      const sessionIds = expiredRows.map((row) => row.id);
      const tableIds = [...new Set(expiredRows.map((row) => row.table_id))];

      await conn.query(
        `UPDATE table_sessions
         SET status = 'expired', ended_at = NOW(), ended_reason = 'timeout'
         WHERE id IN (${sessionIds.map((_, index) => `$${index + 1}`).join(',')})`,
        sessionIds
      );

      await conn.query(
        `UPDATE restaurant_tables
         SET availability_status = 'available'
         WHERE id IN (${tableIds.map((_, index) => `$${index + 1}`).join(',')})`,
        tableIds
      );
    }

    await conn.query('COMMIT');
    return expiredRows.length;
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000);
}

async function endSessionByOrderId(orderId, reason) {
  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows: orderRows } = await conn.query(
      'SELECT id, table_id, table_session_id FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE',
      [orderId]
    );

    if (!orderRows.length) {
      await conn.query('ROLLBACK');
      return false;
    }

    const sessionId = orderRows[0].table_session_id;

    await conn.query(
      `UPDATE table_sessions
       SET status = 'completed', ended_at = NOW(), ended_reason = $1
       WHERE id = $2 AND status = 'active'`,
      [reason, sessionId]
    );

    await conn.query(
      `UPDATE restaurant_tables
       SET availability_status = 'available'
       WHERE id = $1`,
      [orderRows[0].table_id]
    );

    await conn.query('COMMIT');
    return true;
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  SESSION_TIMEOUT_MINUTES,
  generateSessionToken,
  expireInactiveSessions,
  getSessionExpiryDate,
  endSessionByOrderId,
};
