const crypto = require('crypto');

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

function getCashfreeConfig() {
  const clientId = String(process.env.CASHFREE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.CASHFREE_CLIENT_SECRET || '').trim();
  const environment = String(process.env.CASHFREE_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  const apiVersion = String(process.env.CASHFREE_API_VERSION || '').trim();
  const returnUrl = resolveCashfreeReturnUrl();
  const webhookUrl = String(process.env.CASHFREE_WEBHOOK_URL || '').trim();

  return {
    clientId,
    clientSecret,
    environment,
    apiVersion,
    returnUrl,
    webhookUrl,
    configured: Boolean(
      clientId && clientSecret && apiVersion && returnUrl
      && (webhookUrl || process.env.CASHFREE_WEBHOOK_OPTIONAL === 'true')
    ),
  };
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
      message = `Cashfree authentication failed (${config.environment}). Verify API keys and CASHFREE_API_VERSION on the server match the ${config.environment} environment.`;
    }
    const error = new Error(message);
    error.status = response.status >= 500 ? 502 : 400;
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
    webhookOptional: process.env.CASHFREE_WEBHOOK_OPTIONAL === 'true',
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
