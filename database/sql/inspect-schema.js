/**
 * Read-only schema inspection helper.
 * Usage: node database/sql/inspect-schema.js
 * Loads backend/.env for DATABASE_URL
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });

const { Pool } = require('pg');

const useSsl = process.env.DATABASE_SSL === 'true'
  || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000,
});

async function main() {
  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );
  console.log('TABLES:', tables.rows.map((row) => row.table_name).join(', '));

  const migrations = await pool.query(
    `SELECT version, applied_at
     FROM schema_migrations
     ORDER BY applied_at`
  ).catch(() => ({ rows: [] }));

  if (migrations.rows.length) {
    console.log('\nAPPLIED MIGRATIONS:');
    migrations.rows.forEach((row) => console.log(`  - ${row.version} @ ${row.applied_at}`));
  } else {
    console.log('\nAPPLIED MIGRATIONS: none (schema_migrations missing or empty)');
  }
}

main()
  .catch((error) => {
    console.error('ERR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
