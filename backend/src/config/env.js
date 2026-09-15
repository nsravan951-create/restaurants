const REQUIRED_PRODUCTION = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_PUBLIC_URL', 'BACKEND_PUBLIC_URL'];
const CASHFREE_FIELDS = ['CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_API_VERSION', 'CASHFREE_RETURN_URL'];
const CASHFREE_WEBHOOK_OPTIONAL = process.env.CASHFREE_WEBHOOK_OPTIONAL === 'true';

function isProduction() { return process.env.NODE_ENV === 'production'; }
function requireValue(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function getJwtSecret() {
  const value = String(process.env.JWT_SECRET || '').trim();
  if (value) return value;
  if (isProduction()) throw new Error('Missing required environment variable: JWT_SECRET');
  if (process.env.NODE_ENV === 'test') return 'test-only-jwt-secret-not-for-production';
  throw new Error('JWT_SECRET must be configured before starting the backend');
}
function validateEnvironment() {
  if (isProduction()) {
    REQUIRED_PRODUCTION.forEach(requireValue);
    if (getJwtSecret().length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  } else {
    requireValue('DATABASE_URL');
    getJwtSecret();
  }
  const environment = String(process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();
  if (!['sandbox', 'production'].includes(environment)) throw new Error('CASHFREE_ENVIRONMENT must be sandbox or production');
  if (environment === 'production' && !isProduction()) throw new Error('Cashfree production credentials require NODE_ENV=production');
  const cashfreeConfigured = CASHFREE_FIELDS.some((name) => String(process.env[name] || '').trim())
    || String(process.env.CASHFREE_WEBHOOK_URL || '').trim();
  if (cashfreeConfigured) {
    CASHFREE_FIELDS.forEach(requireValue);
    if (!CASHFREE_WEBHOOK_OPTIONAL) {
      requireValue('CASHFREE_WEBHOOK_URL');
    }
  }
  return { cashfreeConfigured, cashfreeEnvironment: environment, cashfreeWebhookOptional: CASHFREE_WEBHOOK_OPTIONAL };
}
module.exports = { getJwtSecret, validateEnvironment };
