const QRCode = require('qrcode');

async function buildQrPayload({ restaurantId, tableId, tableNumber }) {
  const publicBaseUrl = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
  const tableValue = tableNumber ?? tableId;
  const qrUrl = `${publicBaseUrl}/table.html?restaurantId=${encodeURIComponent(restaurantId)}&table=${encodeURIComponent(tableValue)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
