-- Default ₹5 per successful order commission (founding model)
BEGIN;

INSERT INTO commission_rules (restaurant_id, commission_type, commission_value, status)
SELECT NULL, 'fixed_per_order', 5, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules
  WHERE restaurant_id IS NULL AND commission_type = 'fixed_per_order' AND status = 'active'
);

INSERT INTO schema_migrations (version)
VALUES ('008_default_commission_rule')
ON CONFLICT (version) DO NOTHING;

COMMIT;
