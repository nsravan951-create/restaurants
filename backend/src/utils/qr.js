const QRCode = require('qrcode');

function getFrontendProductionUrl() {
  return 'https://restaurants-mauve-two.vercel.app';
}

async function buildQrPayload({ tableId }) {
  const publicBaseUrl = getFrontendProductionUrl();
  const qrUrl = `${publicBaseUrl}/table/${encodeURIComponent(tableId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
