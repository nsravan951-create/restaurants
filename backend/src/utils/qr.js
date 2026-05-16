const QRCode = require('qrcode');

function getFrontendProductionUrl() {
  const fallbackUrl = 'https://your-main-app-name.vercel.app';
  return String(process.env.FRONTEND_PRODUCTION_URL || process.env.FRONTEND_PUBLIC_URL || fallbackUrl).replace(/\/$/, '');
}

async function buildQrPayload({ tableId }) {
  const publicBaseUrl = getFrontendProductionUrl();
  const qrUrl = `${publicBaseUrl}/table/${encodeURIComponent(tableId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
