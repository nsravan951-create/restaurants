const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission, requirePlatformAccess } = require('../middleware/platformPermissions');
const { getAccessibleRestaurantIds, restaurantScopeClause } = require('../utils/rbac');
const { rowsToCsv, sendCsv } = require('../utils/csvExport');

const router = express.Router();

router.use(requireAuth());
router.use(requirePlatformAccess());

function parseExportRange(query) {
  const now = new Date();
  let start = query.from ? new Date(query.from) : new Date(now);
  if (!query.from) start.setDate(start.getDate() - 30);
  const end = query.to ? new Date(query.to) : now;
  return { start, end };
}

router.get('/orders', requirePlatformPermission('orders.export'), asyncHandler(async (req, res) => {
  const { start, end } = parseExportRange(req.query);
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('o.restaurant_id', accessible, 3);
  const params = [start, end, ...scope.params];

  const { rows } = await pool.query(
    `SELECT o.id, o.restaurant_id, r.name AS restaurant_name, o.table_number, o.customer_name,
            o.total_amount, o.status, o.payment_status, o.payment_method, o.invoice_number, o.created_at
     FROM orders o
     INNER JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.created_at BETWEEN $1 AND $2 ${scope.clause}
     ORDER BY o.created_at DESC
     LIMIT 10000`,
    params
  );

  const csv = rowsToCsv(rows, [
    { key: 'id', label: 'Order ID' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'table_number', label: 'Table' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'total_amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'payment_status', label: 'Payment Status' },
    { key: 'payment_method', label: 'Payment Method' },
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'created_at', label: 'Created At' },
  ]);

  sendCsv(res, `orders_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`, csv);
}));

router.get('/reconciliation', requirePlatformPermission('data.export'), asyncHandler(async (req, res) => {
  const { start, end } = parseExportRange(req.query);
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('o.restaurant_id', accessible, 3);
  const params = [start, end, ...scope.params];

  const { rows } = await pool.query(
    `SELECT o.id AS order_id, r.name AS restaurant_name, o.total_amount AS gross_amount,
            col.charge_amount AS commission_amount,
            (o.total_amount - COALESCE(col.charge_amount, 0))::numeric AS restaurant_amount,
            o.payment_status, pt.provider_order_id AS cashfree_order_id,
            pt.provider_payment_id AS cashfree_payment_id, o.created_at
     FROM orders o
     INNER JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN payment_transactions pt ON pt.order_id = o.id
     LEFT JOIN chargeable_order_ledger col ON col.order_id = o.id
     WHERE o.created_at BETWEEN $1 AND $2 ${scope.clause}
     ORDER BY o.created_at DESC
     LIMIT 10000`,
    params
  );

  const csv = rowsToCsv(rows, [
    { key: 'order_id', label: 'Order ID' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'gross_amount', label: 'Gross' },
    { key: 'commission_amount', label: 'Commission' },
    { key: 'restaurant_amount', label: 'Net to Restaurant' },
    { key: 'payment_status', label: 'Payment Status' },
    { key: 'cashfree_order_id', label: 'Cashfree Order ID' },
    { key: 'cashfree_payment_id', label: 'Cashfree Payment ID' },
    { key: 'created_at', label: 'Date' },
  ]);

  sendCsv(res, `reconciliation_${start.toISOString().slice(0, 10)}.csv`, csv);
}));

router.get('/settlements', requirePlatformPermission('data.export'), asyncHandler(async (req, res) => {
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('s.restaurant_id', accessible, 1);

  const { rows } = await pool.query(
    `SELECT s.id, r.name AS restaurant_name, s.period_start, s.period_end,
            s.gross_amount, s.commission_amount, s.refund_amount, s.adjustment_amount,
            s.net_payable, s.status, s.settlement_reference, s.settled_at, s.created_at
     FROM settlements s
     INNER JOIN restaurants r ON r.id = s.restaurant_id
     WHERE 1=1 ${scope.clause}
     ORDER BY s.created_at DESC
     LIMIT 5000`,
    scope.params
  ).catch(() => ({ rows: [] }));

  const csv = rowsToCsv(rows, [
    { key: 'id', label: 'Settlement ID' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'period_start', label: 'Period Start' },
    { key: 'period_end', label: 'Period End' },
    { key: 'gross_amount', label: 'Gross' },
    { key: 'commission_amount', label: 'Commission' },
    { key: 'refund_amount', label: 'Refunds' },
    { key: 'adjustment_amount', label: 'Adjustments' },
    { key: 'net_payable', label: 'Net Payable' },
    { key: 'status', label: 'Status' },
    { key: 'settlement_reference', label: 'Reference' },
    { key: 'settled_at', label: 'Settled At' },
  ]);

  sendCsv(res, 'settlements.csv', csv);
}));

router.get('/restaurants', requirePlatformPermission('data.export'), asyncHandler(async (req, res) => {
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('r.id', accessible, 1);

  const { rows } = await pool.query(
    `SELECT r.id, r.name, u.email AS owner_email, r.phone, r.gstin, r.is_active,
            r.subscription_plan, r.subscription_status, r.upi_vpa, r.created_at
     FROM restaurants r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE 1=1 ${scope.clause}
     ORDER BY r.name ASC`,
    scope.params
  );

  const csv = rowsToCsv(rows, [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Restaurant' },
    { key: 'owner_email', label: 'Owner Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'is_active', label: 'Active' },
    { key: 'subscription_plan', label: 'Plan' },
    { key: 'subscription_status', label: 'Subscription Status' },
    { key: 'upi_vpa', label: 'UPI' },
    { key: 'created_at', label: 'Created At' },
  ]);

  sendCsv(res, 'restaurants.csv', csv);
}));

router.get('/upgrade-queue', requirePlatformPermission('data.export'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT rua.id, r.name AS restaurant_name, u.email AS owner_email, rua.amount,
            rua.status, rua.provider_order_id, rua.activated_at, rua.created_at
     FROM restaurant_upgrade_activations rua
     INNER JOIN restaurants r ON r.id = rua.restaurant_id
     LEFT JOIN users u ON u.id = r.owner_user_id
     ORDER BY rua.created_at DESC
     LIMIT 5000`
  ).catch(() => ({ rows: [] }));

  const csv = rowsToCsv(rows, [
    { key: 'id', label: 'Activation ID' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'owner_email', label: 'Owner Email' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'provider_order_id', label: 'Cashfree Order ID' },
    { key: 'activated_at', label: 'Activated At' },
    { key: 'created_at', label: 'Created At' },
  ]);

  sendCsv(res, 'upgrade_queue.csv', csv);
}));

router.get('/support-tickets', requirePlatformPermission('data.export'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, r.name AS restaurant_name, t.subject, t.category, t.priority, t.status,
            cu.name AS created_by, t.created_at, t.resolved_at
     FROM support_tickets t
     LEFT JOIN restaurants r ON r.id = t.restaurant_id
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     ORDER BY t.created_at DESC
     LIMIT 5000`
  ).catch(() => ({ rows: [] }));

  const csv = rowsToCsv(rows, [
    { key: 'id', label: 'Ticket ID' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'subject', label: 'Subject' },
    { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'created_by', label: 'Created By' },
    { key: 'created_at', label: 'Created At' },
    { key: 'resolved_at', label: 'Resolved At' },
  ]);

  sendCsv(res, 'support_tickets.csv', csv);
}));

module.exports = router;
