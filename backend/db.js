const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const schemaReady = (async () => {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_restaurant_tables_status'
        ) THEN
          ALTER TABLE restaurant_tables DROP CONSTRAINT chk_restaurant_tables_status;
        END IF;

        ALTER TABLE restaurant_tables
          ADD CONSTRAINT chk_restaurant_tables_status
          CHECK (availability_status IN ('available', 'active', 'paid'));
        -- Add idempotency_key column to orders for duplicate prevention
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='idempotency_key'
        ) THEN
          ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(255);
        END IF;

        -- ensure unique index on idempotency_key when present
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'uniq_orders_idempotency_key'
        ) THEN
          CREATE UNIQUE INDEX uniq_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
        END IF;
      END $$;
    `);
  } catch (error) {
    if (!String(error.message || '').includes('constraint "chk_restaurant_tables_status" of relation "restaurant_tables" already exists')) {
      console.warn('[db] schema migration warning:', error.message);
    }
  }
})();

module.exports = Object.assign(pool, { schemaReady });