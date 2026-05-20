const { Pool } = require('pg');

const useSsl = process.env.DATABASE_SSL === 'true'
  || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
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

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'upi_txn_ref'
        ) THEN
          ALTER TABLE orders ADD COLUMN upi_txn_ref VARCHAR(120);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'upi_vpa'
        ) THEN
          ALTER TABLE restaurants ADD COLUMN upi_vpa VARCHAR(120);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'bank_account_name'
        ) THEN
          ALTER TABLE restaurants ADD COLUMN bank_account_name VARCHAR(120);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'bank_name'
        ) THEN
          ALTER TABLE restaurants ADD COLUMN bank_name VARCHAR(120);
        END IF;

        ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_payment_method;
        ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_method
          CHECK (payment_method IN ('online', 'cod', 'upi', 'cash'));
      END $$;
    `);
  } catch (error) {
    if (!String(error.message || '').includes('constraint "chk_restaurant_tables_status" of relation "restaurant_tables" already exists')) {
      console.warn('[db] schema migration warning:', error.message);
    }
  }
})();

module.exports = Object.assign(pool, { schemaReady });