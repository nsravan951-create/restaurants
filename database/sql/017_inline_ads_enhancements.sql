-- Inline advertisement enhancements: targeting, frequency, CTA, mobile image
BEGIN;

ALTER TABLE ads ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cta_text VARCHAR(80) NOT NULL DEFAULT 'Order Now';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS mobile_image_url VARCHAR(255);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS inline_frequency INT NOT NULL DEFAULT 3;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_scope VARCHAR(20) NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ads_inline_frequency'
  ) THEN
    ALTER TABLE ads
      ADD CONSTRAINT chk_ads_inline_frequency
      CHECK (inline_frequency BETWEEN 2 AND 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ads_target_scope'
  ) THEN
    ALTER TABLE ads
      ADD CONSTRAINT chk_ads_target_scope
      CHECK (target_scope IN ('all', 'selected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ad_restaurant_targets (
  ad_id INT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  PRIMARY KEY (ad_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_restaurant_targets_restaurant
  ON ad_restaurant_targets (restaurant_id);

INSERT INTO schema_migrations (version)
VALUES ('017_inline_ads_enhancements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
