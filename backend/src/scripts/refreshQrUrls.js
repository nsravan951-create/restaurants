require('dotenv').config();

const pool = require('../../db');
const { buildQrPayload } = require('../utils/qr');

function parseArgs(argv) {
  const args = { restaurantId: null };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--restaurantId') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--restaurantId must be a positive integer');
      }
      args.restaurantId = value;
      i += 1;
    }
  }

  return args;
}

async function run() {
  const { restaurantId } = parseArgs(process.argv.slice(2));
  const conn = await pool.connect();

  try {
    await conn.query('BEGIN');

    const params = [];
    let sql = `
      SELECT q.id AS qr_id, q.restaurant_id, q.table_id, t.table_number
      FROM qr_codes q
      INNER JOIN restaurant_tables t ON t.id = q.table_id
    `;

    if (restaurantId) {
      sql += ' WHERE q.restaurant_id = $1';
      params.push(restaurantId);
    }

    sql += ' ORDER BY q.id ASC';

    const { rows } = await conn.query(sql, params);

    if (!rows.length) {
      await conn.query('COMMIT');
      console.log('No qr_codes found to refresh.');
      return;
    }

    let updated = 0;

    for (const row of rows) {
      const { qrUrl, qrDataUrl } = await buildQrPayload({
        restaurantId: row.restaurant_id,
        tableId: row.table_id,
        tableNumber: row.table_number,
      });

      await conn.query(
        `UPDATE qr_codes
         SET qr_url = $1, qr_data_url = $2
         WHERE id = $3`,
        [qrUrl, qrDataUrl, row.qr_id]
      );

      updated += 1;
    }

    await conn.query('COMMIT');

    console.log(`QR refresh complete. Updated ${updated} record(s).`);
    if (restaurantId) {
      console.log(`Scope: restaurant_id=${restaurantId}`);
    } else {
      console.log('Scope: all restaurants');
    }
  } catch (error) {
    await conn.query('ROLLBACK');
    console.error('QR refresh failed:', error.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
