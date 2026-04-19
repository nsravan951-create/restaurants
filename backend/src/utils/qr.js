const QRCode = require('qrcode');

function normalizeTableQueryValue(tableNumber, tableId) {
  if (tableNumber !== undefined && tableNumber !== null) {
    const raw = String(tableNumber).trim();
    const numericOnly = raw.match(/\d+/);
    if (/^table\s*\d+$/i.test(raw) && numericOnly) {
      return numericOnly[0];
    }
    return raw;
  }

  return String(tableId);
}

async function buildQrPayload({ restaurantId, tableId, tableNumber }) {
  const publicBaseUrl = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
  const tableValue = normalizeTableQueryValue(tableNumber, tableId);
  const qrUrl = `${publicBaseUrl}/table.html?restaurantId=${encodeURIComponent(restaurantId)}&table=${encodeURIComponent(tableValue)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
