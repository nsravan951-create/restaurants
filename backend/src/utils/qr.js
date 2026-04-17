const QRCode = require('qrcode');

async function buildQrPayload({ restaurantId, tableId }) {
  const publicBaseUrl = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
  const qrUrl = `${publicBaseUrl}/restaurant/${restaurantId}/table/${tableId}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
