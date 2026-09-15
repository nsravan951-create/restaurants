-- Query pattern indexes (safe to re-run)
BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created
  ON orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_payment_status
  ON orders (restaurant_id, payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_table_payment_status
  ON orders (table_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_order
  ON payment_transactions (payment_provider, provider_order_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_qr_token
  ON restaurant_tables (qr_token);

CREATE INDEX IF NOT EXISTS idx_invoice_syncs_restaurant_synced
  ON invoice_syncs (restaurant_id, synced_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('006_performance_indexes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
