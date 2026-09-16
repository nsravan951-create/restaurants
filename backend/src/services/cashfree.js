const crypto = require('crypto');

const DEFAULT_API_VERSION = '2026-01-01';
const SUPPORTED_API_VERSIONS = new Set([
  '2026-01-01',
  '2025-01-01',
  '2023-08-01',
  '2022-09-01',
  '2022-01-01',
  '2021-05-21',
]);

function sanitizeEnvValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function normalizePublicUrl(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  url = url.replace(/^https:\/\/https:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/$/, '');
}

function resolveCashfreeReturnUrl() {
  const explicit = normalizePublicUrl(process.env.CASHFREE_RETURN_URL);
  if (explicit) return explicit;
  const frontend = normalizePublicUrl(process.env.FRONTEND_PUBLIC_URL);
  if (frontend) return `${frontend}/table.html`;
  return '';
}

function maskCredential(value) {
  const text = String(value || '');
  if (!text) return '(missing)';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function validateCashfreeCredentialShape({ clientId, clientSecret, environment, apiVersion }) {
  const issues = [];

  if (!clientId || !clientSecret) {
    issues.push('Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET from Cashfree Dashboard → Developers → API Keys.');
  }

  if (apiVersion && !SUPPORTED_API_VERSIONS.has(apiVersion)) {
    issues.push(`CASHFREE_API_VERSION "${apiVersion}" is not supported. Use ${DEFAULT_API_VERSION}.`);
  }

  const idUpper = clientId.toUpperCase();
  const secretUpper = clientSecret.toUpperCase();

  if (environment === 'sandbox' && (idUpper.startsWith('PROD_') || secretUpper.startsWith('PROD_'))) {
    issues.push('Sandbox mode is enabled but production Cashfree keys were detected. Switch to TEST sandbox keys or set CASHFREE_ENVIRONMENT=production.');
  }

  if (environment === 'production' && (idUpper.startsWith('TEST_') || secretUpper.startsWith('TEST_'))) {
    issues.push('Production mode is enabled but sandbox TEST_ keys were detected. Use live production keys from Cashfree.');
  }

  return issues;
}

function getCashfreeConfig() {
  const clientId = sanitizeEnvValue(process.env.CASHFREE_CLIENT_ID);
  const clientSecret = sanitizeEnvValue(process.env.CASHFREE_CLIENT_SECRET);
  const environment = sanitizeEnvValue(process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();
  const apiVersion = sanitizeEnvValue(process.env.CASHFREE_API_VERSION || DEFAULT_API_VERSION);
  const returnUrl = resolveCashfreeReturnUrl();
  const webhookUrl = sanitizeEnvValue(process.env.CASHFREE_WEBHOOK_URL);

  const credentialIssues = validateCashfreeCredentialShape({
    clientId,
    clientSecret,
    environment,
    apiVersion,
  });

  return {
    clientId,
    clientSecret,
    environment,
    apiVersion,
    returnUrl,
    webhookUrl,
    credentialIssues,
    configured: Boolean(
      clientId && clientSecret && apiVersion && returnUrl
      && (webhookUrl || process.env.CASHFREE_WEBHOOK_OPTIONAL === 'true')
      && credentialIssues.length === 0
    ),
  };
}

function cashfreeCredentialError(issues) {
  const error = new Error(issues.join(' '));
  error.status = 503;
  error.code = 'CASHFREE_INVALID_CREDENTIALS';
  error.issues = issues;
  return error;
}

function cashfreeNotConfiguredError() {
  const error = new Error('Cashfree official SDK/API integration is not configured yet');
  error.status = 503;
  error.code = 'CASHFREE_NOT_CONFIGURED';
  return error;
}

function getCashfreeApiBaseUrl(environment) {
  return environment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

async function cashfreeRequest(path, options = {}) {
  const config = getCashfreeConfig();
  if (config.credentialIssues?.length) {
    throw cashfreeCredentialError(config.credentialIssues);
  }
  if (!config.configured) throw cashfreeNotConfiguredError();

  const response = await fetch(`${getCashfreeApiBaseUrl(config.environment)}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': config.clientId,
      'x-client-secret': config.clientSecret,
      'x-api-version': config.apiVersion,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = data.message || data.type || `Cashfree request failed (${response.status})`;
    let message = providerMessage;
    if (response.status === 401 || /auth/i.test(String(providerMessage))) {
      const hints = [
        `Cashfree authentication failed (${config.environment}).`,
        `Use API version ${config.apiVersion || DEFAULT_API_VERSION}.`,
        config.environment === 'sandbox'
          ? 'Sandbox keys must come from Cashfree test mode (App ID starts with TEST_).'
          : 'Use live production keys from Cashfree.',
        'On Render, re-paste CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET with no quotes or spaces.',
        `Client ID preview: ${maskCredential(config.clientId)}.`,
      ];
      message = hints.join(' ');
    }
    const error = new Error(message);
    error.status = response.status >= 500 ? 502 : 400;
    if (response.status === 401 || /auth/i.test(String(providerMessage))) {
      error.status = 400;
    }
    error.code = 'CASHFREE_PROVIDER_ERROR';
    error.providerResponse = data;
    throw error;
  }
  return data;
}

function buildProviderOrderId(orderId) {
  return `ar_order_${orderId}`;
}

async function createCashfreePaymentOrder({ orderId, amount, currency, customer, returnUrl, reference }) {
  const config = getCashfreeConfig();
  const providerOrder = await cashfreeRequest('/orders', {
    method: 'POST',
    headers: {
      'x-request-id': reference,
      'x-idempotency-key': reference,
    },
    body: JSON.stringify({
      order_id: buildProviderOrderId(orderId),
      order_amount: Number(amount),
      order_currency: currency,
      customer_details: {
        customer_id: customer.id,
        customer_phone: customer.phone || '9999999999',
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: config.webhookUrl || returnUrl,
      },
      order_note: reference,
    }),
  });

  return {
    id: providerOrder.order_id,
    providerOrderId: providerOrder.order_id,
    cashfreeOrderId: providerOrder.order_id,
    cashfreeReferenceId: providerOrder.cf_order_id || null,
    paymentSessionId: providerOrder.payment_session_id,
    checkoutUrl: null,
    raw: providerOrder,
  };
}

function verifyCashfreeWebhookSignature(req) {
  const timestamp = String(req.headers['x-webhook-timestamp'] || '');
  const signature = String(req.headers['x-webhook-signature'] || '');
  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const expected = crypto
    .createHmac('sha256', getCashfreeConfig().clientSecret)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!timestamp || !signature || signatureBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    const error = new Error('Invalid Cashfree webhook signature');
    error.status = 401;
    error.code = 'CASHFREE_INVALID_WEBHOOK_SIGNATURE';
    throw error;
  }
  return req.body || JSON.parse(rawBody);
}

async function fetchCashfreePaymentOrder(providerOrderId) {
  return cashfreeRequest(`/orders/${encodeURIComponent(providerOrderId)}`);
}

function buildCashfreeReturnUrl(orderId, tableId) {
  const config = getCashfreeConfig();
  if (!config.returnUrl) return '';
  const separator = config.returnUrl.includes('?') ? '&' : '?';
  const tableQuery = tableId ? `&tableId=${encodeURIComponent(tableId)}` : '';
  return `${config.returnUrl}${separator}orderId=${encodeURIComponent(orderId)}${tableQuery}`;
}

function createPaymentReference(orderId) {
  return `cf_${orderId}_${crypto.randomBytes(8).toString('hex')}`;
}

function getCashfreePublicConfig() {
  const config = getCashfreeConfig();
  return {
    configured: config.configured,
    environment: config.environment,
    mode: config.environment === 'production' ? 'production' : 'sandbox',
    apiVersion: config.apiVersion || DEFAULT_API_VERSION,
    webhookOptional: process.env.CASHFREE_WEBHOOK_OPTIONAL === 'true',
    returnUrlConfigured: Boolean(config.returnUrl),
    clientIdPreview: maskCredential(config.clientId),
    credentialIssues: config.credentialIssues || [],
  };
}

module.exports = {
  getCashfreeConfig,
  getCashfreePublicConfig,
  createCashfreePaymentOrder,
  fetchCashfreePaymentOrder,
  verifyCashfreeWebhookSignature,
  buildCashfreeReturnUrl,
  createPaymentReference,
  buildProviderOrderId,
};
