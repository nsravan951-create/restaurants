const { Pool } = require('pg');

const useSsl = process.env.DATABASE_SSL === 'true'
  || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  idleTimeoutMillis: 30000,
  max: Number(process.env.DB_POOL_MAX || 10),
});

const STARTUP_TIMEOUT_MS = Number(process.env.DB_STARTUP_TIMEOUT_MS || 10000);

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function ready() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

const schemaReady = withTimeout(ready(), STARTUP_TIMEOUT_MS, 'Database startup check');

module.exports = Object.assign(pool, { ready, schemaReady });
