-- Legacy admin subscription fields on restaurants (parallel to subscriptions table)
BEGIN;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(80);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(40);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_status
  ON restaurants (subscription_status, subscription_expires_at);

INSERT INTO schema_migrations (version)
VALUES ('004_restaurant_subscription_columns')
ON CONFLICT (version) DO NOTHING;

COMMIT;
