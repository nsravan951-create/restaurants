BEGIN;

ALTER TABLE ingredients
  DROP CONSTRAINT IF EXISTS chk_ingredients_stock_values;

ALTER TABLE ingredients
  ADD CONSTRAINT chk_ingredients_stock_values
  CHECK (current_stock >= 0 AND low_stock_threshold >= 0);

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);

UPDATE inventory_transactions t
SET unit = i.unit
FROM ingredients i
WHERE i.id = t.ingredient_id AND t.unit IS NULL;

ALTER TABLE inventory_transactions
  ALTER COLUMN unit SET DEFAULT 'unit';

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS chk_inventory_tx_quantity;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT chk_inventory_tx_quantity CHECK (quantity > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_transaction_idempotency
  ON inventory_transactions (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock
  ON ingredients (restaurant_id, current_stock, low_stock_threshold);

INSERT INTO schema_migrations (version)
VALUES ('020_inventory_enhancements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
