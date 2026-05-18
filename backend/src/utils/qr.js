const QRCode = require('qrcode');

function getFrontendProductionUrl() {
  // Use a fixed Netlify frontend URL for QR links.
  // Update here if your Netlify site changes.
  return 'https://restaurantts.netlify.app/table.html?id=';
}

async function buildQrPayload({ tableId }) {
  const publicBaseUrl = getFrontendProductionUrl();
  const qrUrl = `${publicBaseUrl}${encodeURIComponent(tableId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400 });
  return { qrUrl, qrDataUrl };
}

module.exports = { buildQrPayload };
