/**
 * Verify Cashfree sandbox credentials (does not create real charges).
 * Usage: node scripts/verify-cashfree.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getCashfreeConfig } = require('../src/services/cashfree');

async function main() {
  const config = getCashfreeConfig();
  const required = [
    'CASHFREE_CLIENT_ID',
    'CASHFREE_CLIENT_SECRET',
    'CASHFREE_API_VERSION',
    'CASHFREE_RETURN_URL',
  ];
  if (process.env.CASHFREE_WEBHOOK_OPTIONAL !== 'true') {
    required.push('CASHFREE_WEBHOOK_URL');
  }
  const missing = required.filter((name) => !String(process.env[name] || '').trim());

  console.log('Environment:', config.environment);
  console.log('API version:', config.apiVersion || '(missing)');
  console.log('Client ID preview:', config.clientId ? `${config.clientId.slice(0, 6)}…` : '(missing)');
  console.log('Configured:', config.configured);
  if (config.credentialIssues?.length) {
    console.error('Credential issues:');
    config.credentialIssues.forEach((issue) => console.error(' -', issue));
    process.exitCode = 1;
    return;
  }
  if (missing.length) {
    console.log('Missing:', missing.join(', '));
    process.exitCode = 1;
    return;
  }

  const base = config.environment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  const testOrderId = `autoresto_verify_${Date.now()}`;
  const response = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': config.clientId,
      'x-client-secret': config.clientSecret,
      'x-api-version': config.apiVersion,
      'x-request-id': testOrderId,
      'x-idempotency-key': testOrderId,
    },
    body: JSON.stringify({
      order_id: testOrderId,
      order_amount: 1,
      order_currency: 'INR',
      customer_details: {
        customer_id: 'verify_customer',
        customer_phone: '9999999999',
      },
      order_meta: {
        return_url: config.returnUrl,
        notify_url: config.webhookUrl || config.returnUrl,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Cashfree API test FAILED:', response.status, data.message || data.type || JSON.stringify(data));
    process.exitCode = 1;
    return;
  }

  console.log('Cashfree API test OK');
  console.log('  order_id:', data.order_id);
  console.log('  payment_session_id:', data.payment_session_id ? '(received)' : '(missing)');
  console.log('Return URL:', config.returnUrl);
  console.log('Webhook URL:', config.webhookUrl);
  console.log('\nSandbox checkout: use table.html with Cashfree button (mode=sandbox on non-production hosts).');
}

main().catch((error) => {
  console.error('Verify failed:', error.message);
  process.exitCode = 1;
});
