-- 016: Platform-wide settings (AutoResto payout bank account, etc.)

BEGIN;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('autoresto_payout_bank', '{}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('016_platform_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
