const QRCode = require('qrcode');

function getFrontendProductionUrl() {
  const base = String(process.env.FRONTEND_PUBLIC_URL || 'https://restaurantts.netlify.app').replace(/\/$/, '');
  return `${base}/table.html?id=`;
}

async function buildQrPayload({ tableId }) {
  const publicBaseUrl = getFrontendProductionUrl();
  const qrUrl = `${publicBaseUrl}${encodeURIComponent(tableId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
