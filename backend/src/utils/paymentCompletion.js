const pool = require('../config/db');
const { syncInvoiceForOrder } = require('./invoiceSync');
const { recordChargeableOrder } = require('./financial');
const { endSessionByOrderId } = require('./tableSession');
const { emitOrderUpdate, emitTableUpdate } = require('../services/socket');
const { writeAuditLog } = require('./auditLog');
const { assignInvoiceNumber } = require('./gst');

async function finalizePaidOrder(orderId, {
  method = 'cash',
  provider = 'cash',
  actorUserId = null,
  providerPaymentId = null,
  providerPayload = null,
} = {}) {
  await endSessionByOrderId(orderId, 'payment_completed');
  await syncInvoiceForOrder(orderId);
  await recordChargeableOrder(orderId);

  const { rows } = await pool.query(
    'SELECT restaurant_id, table_id, total_amount FROM orders WHERE id = $1 LIMIT 1',
    [orderId]
  );
  if (!rows.length) return null;

  const order = rows[0];
  await writeAuditLog({
    actorUserId,
    restaurantId: order.restaurant_id,
    action: `${provider}_payment_recorded`,
    resourceType: 'order',
    resourceId: orderId,
    metadata: {
      amount: Number(order.total_amount),
      providerPaymentId,
      providerPayload: providerPayload ? 'present' : null,
    },
  });

  emitOrderUpdate(order.restaurant_id, { type: 'paid', orderId, method, provider });
  emitTableUpdate(order.restaurant_id, {
    tableId: order.table_id,
    status: 'available',
    paymentMethod: method,
    paymentStatus: 'paid',
  });

  return order;
}

async function completeCashPayment(orderId, actorUserId = null) {
  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT id, restaurant_id, table_id, payment_status, total_amount
       FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );

    if (!rows.length) {
      await conn.query('ROLLBACK');
      return { ok: false, status: 404, message: 'Order not found' };
    }

    const order = rows[0];
    if (order.payment_status === 'paid') {
      await conn.query('ROLLBACK');
      return {
        ok: true,
        status: 200,
        message: 'Order already paid',
        orderId,
        restaurantId: order.restaurant_id,
        tableId: order.table_id,
      };
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = 'paid', payment_method = 'cash', payment_provider = 'cash', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId]
    );

    await conn.query(
      `INSERT INTO payment_transactions
         (order_id, restaurant_id, payment_provider, payment_purpose, amount, currency, status)
       VALUES ($1, $2, 'cash', 'CUSTOMER_ORDER', $3, 'INR', 'paid')
       ON CONFLICT (order_id) DO UPDATE SET
         status = 'paid',
         payment_provider = 'cash',
         payment_purpose = 'CUSTOMER_ORDER',
         amount = EXCLUDED.amount,
         updated_at = CURRENT_TIMESTAMP`,
      [orderId, order.restaurant_id, order.total_amount]
    );

    await assignInvoiceNumber(conn, orderId, order.restaurant_id);
    await conn.query('COMMIT');

    await finalizePaidOrder(orderId, { method: 'cash', provider: 'cash', actorUserId });

    return {
      ok: true,
      status: 200,
      message: 'Cash payment recorded',
      orderId,
      restaurantId: order.restaurant_id,
      tableId: order.table_id,
    };
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

async function completeOnlinePayment(orderId, {
  provider = 'cashfree',
  providerPaymentId = null,
  providerPayload = null,
  actorUserId = null,
} = {}) {
  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const { rows: orderRows } = await conn.query(
      `SELECT id, restaurant_id, table_id, payment_status, total_amount
       FROM orders
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRows.length) {
      await conn.query('ROLLBACK');
      return { ok: false, status: 404, message: 'Order not found' };
    }

    const order = orderRows[0];

    const { rows: txnRows } = await conn.query(
      `SELECT amount AS txn_amount, status AS txn_status
       FROM payment_transactions
       WHERE order_id = $1 AND payment_provider = $2
       LIMIT 1
       FOR UPDATE`,
      [orderId, provider]
    );
    const txn = txnRows[0] || {};

    if (order.payment_status === 'paid') {
      await conn.query('ROLLBACK');
      return { ok: true, status: 200, message: 'Order already paid', orderId, alreadyPaid: true };
    }

    if (txn.txn_status === 'paid') {
      await conn.query('ROLLBACK');
      return { ok: true, status: 200, message: 'Payment already recorded', orderId, alreadyPaid: true };
    }

    await conn.query(
      `UPDATE payment_transactions
       SET status = 'paid',
           provider_payment_id = COALESCE($1, provider_payment_id),
           provider_payload = COALESCE($2::jsonb, provider_payload),
           updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $3 AND payment_provider = $4 AND status <> 'paid'`,
      [
        providerPaymentId,
        providerPayload ? JSON.stringify(providerPayload) : null,
        orderId,
        provider,
      ]
    );

    await conn.query(
      `UPDATE orders
       SET payment_status = 'paid', payment_method = $1, payment_provider = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND payment_status <> 'paid'`,
      [provider, orderId]
    );

    await assignInvoiceNumber(conn, orderId, order.restaurant_id);
    await conn.query('COMMIT');

    await finalizePaidOrder(orderId, {
      method: provider,
      provider,
      actorUserId,
      providerPaymentId,
      providerPayload,
    });

    return { ok: true, status: 200, message: 'Online payment recorded', orderId };
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

async function markOnlinePaymentFailed(orderId, provider = 'cashfree', providerPayload = null) {
  await pool.query(
    `UPDATE payment_transactions
     SET status = 'failed', provider_payload = COALESCE($1::jsonb, provider_payload), updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $2 AND payment_provider = $3 AND status NOT IN ('paid', 'failed')`,
    [providerPayload ? JSON.stringify(providerPayload) : null, orderId, provider]
  );
  await pool.query(
    `UPDATE orders SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND payment_status = 'pending'`,
    [orderId]
  );
}

module.exports = {
  completeCashPayment,
  completeOnlinePayment,
  markOnlinePaymentFailed,
  finalizePaidOrder,
};
