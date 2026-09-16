const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTableQrUrl, isCanonicalTableQrUrl } = require('../src/utils/qr');

test('buildTableQrUrl uses secure token parameter', () => {
  process.env.FRONTEND_PUBLIC_URL = 'https://autoresto.in';
  const url = buildTableQrUrl('abc123token456');
  assert.equal(url, 'https://autoresto.in/table.html?t=abc123token456');
  assert.equal(isCanonicalTableQrUrl(url), true);
});

test('legacy table id URLs are not canonical', () => {
  assert.equal(isCanonicalTableQrUrl('https://autoresto.in/table.html?id=12'), false);
});

test('wrong-origin token URLs are not canonical', () => {
  process.env.FRONTEND_PUBLIC_URL = 'https://autoresto.in';
  assert.equal(
    isCanonicalTableQrUrl('https://restaurantts.netlify.app/table.html?t=abc123token456'),
    false
  );
});
