const QRCode = require('qrcode');

const DEFAULT_FRONTEND_ORIGIN = 'https://restaurantts.netlify.app';

/**
 * Canonical customer URL: https://restaurantts.netlify.app/table.html?id=71
 */
function getFrontendOrigin() {
  let base = String(process.env.FRONTEND_PUBLIC_URL || DEFAULT_FRONTEND_ORIGIN).trim();
  base = base.replace(/\/$/, '');
  // Allow env to be full URL or origin only; strip accidental table.html suffix
  base = base.replace(/\/table\.html.*$/i, '');
  return base;
}

function buildTableQrUrl(tableId) {
  const id = Number(tableId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid tableId for QR URL');
  }
  return `${getFrontendOrigin()}/table.html?id=${id}`;
}

function isCanonicalTableQrUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const id = parsed.searchParams.get('id');
    return /\/table\.html$/i.test(parsed.pathname) && id && /^\d+$/.test(String(id));
  } catch (error) {
    return /table\.html\?id=\d+/i.test(String(url));
  }
}

async function buildQrPayload({ tableId }) {
  const qrUrl = buildTableQrUrl(tableId);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

async function refreshQrForTable(conn, { restaurantId, tableId }) {
  const { qrUrl, qrDataUrl } = await buildQrPayload({ tableId });

  const existing = await conn.query(
    'SELECT id FROM qr_codes WHERE restaurant_id = $1 AND table_id = $2 LIMIT 1',
    [restaurantId, tableId]
  );

  if (existing.rows.length) {
    await conn.query(
      'UPDATE qr_codes SET qr_url = $1, qr_data_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [qrUrl, qrDataUrl, existing.rows[0].id]
    );
  } else {
    await conn.query(
      `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
       VALUES ($1, $2, $3, $4)`,
      [restaurantId, tableId, qrUrl, qrDataUrl]
    );
  }

  return { qrUrl, qrDataUrl };
}

module.exports = {
  getFrontendOrigin,
  buildTableQrUrl,
  isCanonicalTableQrUrl,
  buildQrPayload,
  refreshQrForTable,
};
