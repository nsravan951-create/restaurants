const pool = require('../config/db');
const { listRestaurantFeatures } = require('./featureAccess');

async function loadRestaurantFinancials(restaurantId) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, phone, address, is_active, onboarding_status,
            upi_vpa, bank_account_name, bank_name,
            legal_name, gstin, business_address, state_name, state_code,
            default_gst_rate, invoice_prefix, fssai_license,
            subscription_plan, subscription_status, subscription_expires_at,
            dashboard_layout, created_at, last_activity_at
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  if (!rows.length) return null;

  const restaurant = rows[0];
  const { rows: ownerRows } = await pool.query(
    `SELECT id, name, email, phone, last_login_at FROM users WHERE id = (
       SELECT owner_user_id FROM restaurants WHERE id = $1
     ) LIMIT 1`,
    [restaurantId]
  );

  const { rows: bankRows } = await pool.query(
    `SELECT id, account_holder_name, bank_name, account_number_last4, ifsc_code,
            upi_id, verification_status, is_primary, created_at, updated_at
     FROM restaurant_bank_accounts WHERE restaurant_id = $1
     ORDER BY is_primary DESC, id DESC`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  const features = await listRestaurantFeatures(restaurantId);

  const { rows: subRows } = await pool.query(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, s.amount, s.currency, s.provider_order_id,
            p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN plans p ON p.id = s.plan_id
     WHERE s.restaurant_id = $1
     ORDER BY s.created_at DESC LIMIT 5`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  const { rows: upgradePayments } = await pool.query(
    `SELECT pt.id, pt.order_id, pt.amount, pt.status, pt.payment_provider,
            pt.provider_order_id, pt.provider_payment_id, pt.payment_purpose, pt.created_at,
            rua.id AS activation_id, rua.status AS activation_status, rua.activated_at
     FROM payment_transactions pt
     LEFT JOIN restaurant_upgrade_activations rua ON rua.payment_transaction_id = pt.id
     WHERE pt.restaurant_id = $1
       AND pt.payment_purpose IN ('RESTAURANT_UPGRADE', 'RESTAURANT_SUBSCRIPTION')
     ORDER BY pt.created_at DESC LIMIT 20`,
    [restaurantId]
  ).catch(() => ({ rows: [] }));

  const { rows: commissionRows } = await pool.query(
    `SELECT COALESCE(SUM(charge_amount), 0)::numeric AS total_commission,
            COUNT(*)::int AS chargeable_orders
     FROM chargeable_order_ledger WHERE restaurant_id = $1 AND status = 'chargeable'`,
    [restaurantId]
  ).catch(() => ({ rows: [{ total_commission: 0, chargeable_orders: 0 }] }));

  const { rows: revenueRows } = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0)::numeric AS total_revenue,
            COUNT(*)::int AS paid_orders
     FROM orders WHERE restaurant_id = $1 AND payment_status = 'paid'`,
    [restaurantId]
  );

  const { rows: pendingSettlements } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM settlements
     WHERE restaurant_id = $1 AND status IN ('pending', 'processing', 'on_hold')`,
    [restaurantId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  return {
    restaurant,
    owner: ownerRows[0] || null,
    bankAccounts: bankRows.map((b) => ({
      ...b,
      account_masked: b.account_number_last4 ? `XXXX XXXX ${b.account_number_last4}` : '—',
    })),
    features,
    subscriptions: subRows,
    upgradePayments,
    stats: {
      totalRevenue: Number(revenueRows[0]?.total_revenue || 0),
      paidOrders: Number(revenueRows[0]?.paid_orders || 0),
      totalCommission: Number(commissionRows[0]?.total_commission || 0),
      chargeableOrders: Number(commissionRows[0]?.chargeable_orders || 0),
      netToRestaurant: Number(revenueRows[0]?.total_revenue || 0) - Number(commissionRows[0]?.total_commission || 0),
      pendingSettlements: Number(pendingSettlements[0]?.count || 0),
    },
  };
}

module.exports = { loadRestaurantFinancials };
