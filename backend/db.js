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
      END $$;
    `);
  } catch (error) {
    if (!String(error.message || '').includes('constraint "chk_restaurant_tables_status" of relation "restaurant_tables" already exists')) {
      console.warn('[db] schema migration warning:', error.message);
    }
  }
})();

module.exports = Object.assign(pool, { schemaReady });