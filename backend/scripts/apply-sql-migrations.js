/**
 * Apply database/sql/*.sql in numeric order.
 * Usage: node scripts/apply-sql-migrations.js
 * Requires DATABASE_URL in backend/.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const sqlDir = path.join(__dirname, '..', '..', 'database', 'sql');
const useSsl = process.env.DATABASE_SSL === 'true'
  || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
});

function listSqlFiles() {
  return fs.readdirSync(sqlDir)
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const files = listSqlFiles();
  if (!files.length) {
    console.log('No migration files found in database/sql/');
    return;
  }

  for (const file of files) {
    const fullPath = path.join(sqlDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    console.log(`Applying ${file}...`);
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }

  const { rows } = await pool.query('SELECT version, applied_at FROM schema_migrations ORDER BY applied_at');
  console.log('\nMigration state:');
  rows.forEach((row) => console.log(`  - ${row.version} @ ${row.applied_at}`));
}

main()
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
