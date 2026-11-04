BEGIN;

ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS settlements_status_check;

ALTER TABLE settlements
  ADD CONSTRAINT settlements_status_check
  CHECK (status IN ('pending', 'scheduled', 'processing', 'sent', 'verified', 'paid', 'failed', 'on_hold', 'cancelled'));

ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS chk_settlement_period;

ALTER TABLE settlements
  ADD CONSTRAINT chk_settlement_period CHECK (period_end > period_start);

ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS chk_settlement_amounts;

ALTER TABLE settlements
  ADD CONSTRAINT chk_settlement_amounts CHECK (
    gross_amount >= 0
    AND commission_amount >= 0
    AND refund_amount >= 0
    AND net_payable >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_settlement_period
  ON settlements (restaurant_id, period_start, period_end)
  WHERE status NOT IN ('failed', 'cancelled');

INSERT INTO schema_migrations (version)
VALUES ('019_settlement_reconciliation_enhancements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
