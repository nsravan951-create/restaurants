-- Extended ad media fields used by super-admin ad management
BEGIN;

ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_url VARCHAR(255);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_type VARCHAR(40) NOT NULL DEFAULT 'image';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS display_mode VARCHAR(40) NOT NULL DEFAULT 'grid';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ads_media_type'
  ) THEN
    ALTER TABLE ads
      ADD CONSTRAINT chk_ads_media_type
      CHECK (media_type IN ('image', 'video', 'banner'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ads_updated_at ON ads;
CREATE TRIGGER trg_ads_updated_at
BEFORE UPDATE ON ads
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('003_ads_media_extensions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
