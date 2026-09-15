const QRCode = require('qrcode');

const DEFAULT_FRONTEND_ORIGIN = 'https://autoresto.in';

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

function buildTableQrUrl(qrToken) {
  const token = String(qrToken || '').trim();
  if (token.length < 8) {
    throw new Error('Invalid qrToken for QR URL');
  }
  return `${getFrontendOrigin()}/table.html?t=${encodeURIComponent(token)}`;
}

function isCanonicalTableQrUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const token = parsed.searchParams.get('t') || parsed.searchParams.get('token');
    return /\/table\.html$/i.test(parsed.pathname) && Boolean(token && token.length >= 8);
  } catch (error) {
    return /table\.html\?t=[^&]+/i.test(String(url));
  }
}

async function buildQrPayload({ qrToken }) {
  const qrUrl = buildTableQrUrl(qrToken);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

async function refreshQrForTable(conn, { restaurantId, tableId }) {
  const { rows } = await conn.query(
    'SELECT qr_token FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
    [tableId, restaurantId]
  );
  if (!rows.length) throw new Error('Table not found for QR refresh');

  const { qrUrl, qrDataUrl } = await buildQrPayload({ qrToken: rows[0].qr_token });

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
