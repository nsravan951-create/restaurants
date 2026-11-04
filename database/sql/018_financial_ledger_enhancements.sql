BEGIN;

ALTER TABLE financial_ledger_entries
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'debit',
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_entry_id INTEGER REFERENCES financial_ledger_entries(id) ON DELETE SET NULL;

UPDATE financial_ledger_entries
SET direction = 'credit'
WHERE entry_type IN ('customer_payment', 'settlement', 'other_income');

ALTER TABLE financial_ledger_entries
  DROP CONSTRAINT IF EXISTS chk_ledger_type;

ALTER TABLE financial_ledger_entries
  ADD CONSTRAINT chk_ledger_type CHECK (
    entry_type IN (
      'customer_payment', 'commission', 'subscription_payment', 'upgrade',
      'refund', 'settlement', 'adjustment', 'inventory_purchase',
      'supplier_payment', 'staff_expense', 'rent', 'utilities',
      'packaging_cost', 'other_income', 'other_expense', 'reversal'
    )
  );

ALTER TABLE financial_ledger_entries
  DROP CONSTRAINT IF EXISTS chk_ledger_direction;

ALTER TABLE financial_ledger_entries
  ADD CONSTRAINT chk_ledger_direction CHECK (direction IN ('credit', 'debit'));

ALTER TABLE financial_ledger_entries
  DROP CONSTRAINT IF EXISTS chk_ledger_amount_positive;

ALTER TABLE financial_ledger_entries
  ADD CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_restaurant_created
  ON financial_ledger_entries (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_restaurant_category
  ON financial_ledger_entries (restaurant_id, category, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_financial_ledger_reference
  ON financial_ledger_entries (restaurant_id, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Posted financial ledger entries are immutable';
  END IF;

  IF OLD.reversed_entry_id IS NOT NULL
     OR NEW.reversed_entry_id IS NULL
     OR NEW.reversed_entry_id = OLD.reversed_entry_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id
     OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Posted financial ledger entries are immutable; create a reversal instead';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_ledger_immutable ON financial_ledger_entries;

CREATE TRIGGER financial_ledger_immutable
  BEFORE UPDATE OR DELETE ON financial_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_financial_ledger_mutation();

INSERT INTO schema_migrations (version)
VALUES ('018_financial_ledger_enhancements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
