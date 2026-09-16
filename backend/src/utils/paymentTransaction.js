const { isMissingColumnError } = require('./gst');

async function upsertCashfreeTransaction(pool, {
  orderId,
  restaurantId,
  providerOrderId,
  amount,
  providerPayload,
}) {
  const payloadJson = JSON.stringify(providerPayload);

  try {
    await pool.query(
      `INSERT INTO payment_transactions
         (order_id, restaurant_id, payment_provider, payment_purpose, provider_order_id, amount, currency, status, provider_payload)
       VALUES ($1, $2, 'cashfree', 'CUSTOMER_ORDER', $3, $4, 'INR', 'pending', $5::jsonb)
       ON CONFLICT (order_id) DO UPDATE SET
         restaurant_id = EXCLUDED.restaurant_id,
         provider_order_id = EXCLUDED.provider_order_id,
         payment_purpose = EXCLUDED.payment_purpose,
         amount = EXCLUDED.amount,
         currency = EXCLUDED.currency,
         status = 'pending',
         provider_payload = EXCLUDED.provider_payload,
         updated_at = CURRENT_TIMESTAMP`,
      [orderId, restaurantId, providerOrderId, amount, payloadJson]
    );
    return;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }

  await pool.query(
    `INSERT INTO payment_transactions
       (order_id, payment_provider, provider_order_id, amount, currency, status, provider_payload)
     VALUES ($1, 'cashfree', $2, $3, 'INR', 'pending', $4::jsonb)
     ON CONFLICT (order_id) DO UPDATE SET
       provider_order_id = EXCLUDED.provider_order_id,
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       status = 'pending',
       provider_payload = EXCLUDED.provider_payload,
       updated_at = CURRENT_TIMESTAMP`,
    [orderId, providerOrderId, amount, payloadJson]
  );
}

module.exports = { upsertCashfreeTransaction };
