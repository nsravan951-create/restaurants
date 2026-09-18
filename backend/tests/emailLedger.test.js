const test = require('node:test');
const assert = require('node:assert/strict');
const { generateLedgerEmailHtml, sendLedgerEmail } = require('../src/services/emailLedger');

test('generateLedgerEmailHtml builds valid HTML with financial fields', () => {
  const html = generateLedgerEmailHtml({
    restaurantName: 'Saffron Bistro',
    ownerName: 'Chef Rahul',
    dateFormatted: '18 September 2026',
    totalOrders: 42,
    grossSales: 18450,
    refunds: 250,
    commission: 1845,
    restaurantPayable: 16355,
    settlementStatus: 'paid',
    settlementReference: 'CF_SETTLE_99482',
  });

  assert.ok(html.includes('Saffron Bistro'), 'includes restaurant name');
  assert.ok(html.includes('18 September 2026'), 'includes date');
  assert.ok(html.includes('42 orders'), 'includes order count');
  assert.ok(html.includes('18,450.00'), 'formats gross sales');
  assert.ok(html.includes('16,355.00'), 'formats net payable');
  assert.ok(html.includes('CF_SETTLE_99482'), 'includes settlement reference');
  assert.ok(html.includes('PAID'), 'includes status badge');
  assert.ok(html.includes('Powered by AutoResto'), 'includes AutoResto branding');
});

test('sendLedgerEmail simulates in sandbox when RESEND_API_KEY missing', async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const result = await sendLedgerEmail({
      to: 'owner@example.com',
      restaurantName: 'Demo Resto',
      ownerName: 'Owner',
      dateFormatted: '18 Sep 2026',
      totalOrders: 10,
      grossSales: 5000,
      refunds: 0,
      commission: 500,
      restaurantPayable: 4500,
      settlementStatus: 'pending',
    });

    assert.equal(result.success, true);
    assert.equal(result.mocked, true);
    assert.ok(result.previewHtml.includes('Demo Resto'));
  } finally {
    if (prev) process.env.RESEND_API_KEY = prev;
  }
});
