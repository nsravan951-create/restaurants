const crypto = require('crypto');

function getCashfreeConfig() {
  const clientId = String(process.env.CASHFREE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.CASHFREE_CLIENT_SECRET || '').trim();
  const environment = String(process.env.CASHFREE_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  const apiVersion = String(process.env.CASHFREE_API_VERSION || '').trim();
  const returnUrl = String(process.env.CASHFREE_RETURN_URL || '').trim();
  const webhookUrl = String(process.env.CASHFREE_WEBHOOK_URL || '').trim();

  return {
    clientId,
    clientSecret,
    environment,
    apiVersion,
    returnUrl,
    webhookUrl,
    configured: Boolean(clientId && clientSecret && apiVersion && returnUrl && webhookUrl),
  };
}

function cashfreeNotConfiguredError() {
  const error = new Error('Cashfree official SDK/API integration is not configured yet');
  error.status = 503;
  error.code = 'CASHFREE_NOT_CONFIGURED';
  return error;
}

async function createCashfreePaymentOrder() {
  // The official Cashfree SDK/API contract must be supplied before making provider calls.
  // Never simulate a payment order or expose credentials from the browser.
  throw cashfreeNotConfiguredError();
}

function verifyCashfreeWebhookSignature() {
  const error = new Error('Cashfree webhook verification is not configured yet');
  error.status = 501;
  error.code = 'CASHFREE_WEBHOOK_NOT_CONFIGURED';
  throw error;
}

function buildCashfreeReturnUrl(orderId) {
  const config = getCashfreeConfig();
  if (!config.returnUrl) return '';
  const separator = config.returnUrl.includes('?') ? '&' : '?';
  return `${config.returnUrl}${separator}orderId=${encodeURIComponent(orderId)}`;
}

function createPaymentReference(orderId) {
  return `cf_${orderId}_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  getCashfreeConfig,
  createCashfreePaymentOrder,
  verifyCashfreeWebhookSignature,
  buildCashfreeReturnUrl,
  createPaymentReference,
};
