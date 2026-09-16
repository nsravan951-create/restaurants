const test = require('node:test');
const assert = require('node:assert/strict');

test('rejects production keys when sandbox environment is selected', () => {
  process.env.CASHFREE_ENVIRONMENT = 'sandbox';
  process.env.CASHFREE_CLIENT_ID = 'PROD_12345';
  process.env.CASHFREE_CLIENT_SECRET = 'secret';
  process.env.CASHFREE_API_VERSION = '2026-01-01';
  process.env.CASHFREE_RETURN_URL = 'http://localhost:5500/table.html';
  process.env.CASHFREE_WEBHOOK_OPTIONAL = 'true';
  delete require.cache[require.resolve('../src/services/cashfree')];
  const { getCashfreePublicConfig } = require('../src/services/cashfree');
  const config = getCashfreePublicConfig();
  assert.equal(config.configured, false);
  assert.ok(config.credentialIssues.length > 0);
});

test('sandbox mode when CASHFREE_ENVIRONMENT=sandbox', () => {
  process.env.CASHFREE_ENVIRONMENT = 'sandbox';
  process.env.CASHFREE_CLIENT_ID = 'test_id';
  process.env.CASHFREE_CLIENT_SECRET = 'test_secret';
  process.env.CASHFREE_API_VERSION = '2026-01-01';
  process.env.CASHFREE_RETURN_URL = 'http://localhost:5500/table.html';
  process.env.CASHFREE_WEBHOOK_OPTIONAL = 'true';
  delete require.cache[require.resolve('../src/services/cashfree')];
  const { getCashfreePublicConfig, buildProviderOrderId } = require('../src/services/cashfree');
  const config = getCashfreePublicConfig();
  assert.equal(config.mode, 'sandbox');
  assert.equal(config.configured, true);
  assert.equal(buildProviderOrderId(42), 'ar_order_42');
});

test('parses AutoResto order id from Cashfree return query', () => {
  process.env.CASHFREE_ENVIRONMENT = 'sandbox';
  process.env.CASHFREE_CLIENT_ID = 'test_id';
  process.env.CASHFREE_CLIENT_SECRET = 'test_secret';
  process.env.CASHFREE_API_VERSION = '2026-01-01';
  process.env.CASHFREE_RETURN_URL = 'http://localhost:5000/api/payments/cashfree/return';
  process.env.FRONTEND_PUBLIC_URL = 'https://autoresto.in';
  process.env.CASHFREE_WEBHOOK_OPTIONAL = 'true';
  delete require.cache[require.resolve('../src/services/cashfree')];
  const {
    parseOrderIdFromReturnQuery,
    buildCustomerPaymentSuccessUrl,
  } = require('../src/services/cashfree');

  assert.equal(parseOrderIdFromReturnQuery({ orderId: '15' }), 15);
  assert.equal(parseOrderIdFromReturnQuery({ order_id: 'ar_order_15' }), 15);
  assert.equal(
    buildCustomerPaymentSuccessUrl({
      orderId: 15,
      sessionToken: 'session-token-value',
      status: 'paid',
      tableId: 3,
    }),
    'https://autoresto.in/payment-success.html?orderId=15&sessionToken=session-token-value&status=paid&tableId=3'
  );
});
