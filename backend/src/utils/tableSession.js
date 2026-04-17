const crypto = require('crypto');
const pool = require('../config/db');

const SESSION_TIMEOUT_MINUTES = Number(process.env.TABLE_SESSION_TIMEOUT_MINUTES || 20);

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function expireInactiveSessions() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [expiredRows] = await conn.query(
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
         WHERE id IN (${sessionIds.map(() => '?').join(',')})`,
        sessionIds
      );

      await conn.query(
        `UPDATE restaurant_tables
         SET availability_status = 'available'
         WHERE id IN (${tableIds.map(() => '?').join(',')})`,
        tableIds
      );
    }

    await conn.commit();
    return expiredRows.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000);
}

async function endSessionByOrderId(orderId, reason) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      'SELECT id, table_id, table_session_id FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
      [orderId]
    );

    if (!orderRows.length) {
      await conn.rollback();
      return false;
    }

    const sessionId = orderRows[0].table_session_id;

    await conn.query(
      `UPDATE table_sessions
       SET status = 'completed', ended_at = NOW(), ended_reason = ?
       WHERE id = ? AND status = 'active'`,
      [reason, sessionId]
    );

    await conn.query(
      `UPDATE restaurant_tables
       SET availability_status = 'available'
       WHERE id = ?`,
      [orderRows[0].table_id]
    );

    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
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
