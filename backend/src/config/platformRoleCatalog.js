/**
 * Canonical platform team roles — used for access checks, login routing, and admin UI.
 * super_admin is NOT listed here; it bypasses all permission checks.
 */
const PLATFORM_ROLE_CATALOG = [
  {
    roleKey: 'finance_manager',
    name: 'Finance Manager',
    department: 'Finance',
    description: 'Full finance access — commissions, settlements, refunds, bank details.',
  },
  {
    roleKey: 'payment_manager',
    name: 'Payment Manager',
    department: 'Finance',
    description: 'Cashfree reconciliation, payment transactions, restaurant payout details.',
  },
  {
    roleKey: 'settlement_manager',
    name: 'Settlement Manager',
    department: 'Finance',
    description: 'Create and track restaurant settlement batches and payout status.',
  },
  {
    roleKey: 'subscription_manager',
    name: 'Subscription Manager',
    department: 'Finance',
    description: 'Manage SaaS plans, subscriptions, and billing for restaurants.',
  },
  {
    roleKey: 'restaurant_manager',
    name: 'Restaurant Manager',
    department: 'Operations',
    description: 'Day-to-day restaurant operations, suspend/activate, orders overview.',
  },
  {
    roleKey: 'registration_manager',
    name: 'Registration Manager',
    department: 'Operations',
    description: 'Onboard new restaurants and owners (register accounts).',
  },
  {
    roleKey: 'operations_manager',
    name: 'Operations Manager',
    department: 'Operations',
    description: 'Live platform operations — active orders and restaurant status.',
  },
  {
    roleKey: 'features_manager',
    name: 'Features Manager',
    department: 'Operations',
    description: 'Enable features after verified upgrade payments.',
  },
  {
    roleKey: 'ads_manager',
    name: 'Ads Manager',
    department: 'Marketing',
    description: 'Create and manage promotions, banners, and ad campaigns.',
  },
  {
    roleKey: 'promotions_manager',
    name: 'Promotions Manager',
    department: 'Marketing',
    description: 'Marketing campaigns and promotional content (legacy ads role).',
  },
  {
    roleKey: 'analytics_manager',
    name: 'Analytics Manager',
    department: 'Analytics',
    description: 'Platform analytics, revenue reports, and CSV exports.',
  },
  {
    roleKey: 'user_enquiry_manager',
    name: 'Support / Enquiry Manager',
    department: 'Support',
    description: 'Handle support tickets and restaurant enquiries.',
  },
  {
    roleKey: 'support_manager',
    name: 'Support Manager',
    department: 'Support',
    description: 'Full support queue — assign, reply, resolve tickets.',
  },
  {
    roleKey: 'database_manager',
    name: 'Database Manager',
    department: 'Technology',
    description: 'Database health, migrations, and maintenance.',
  },
  {
    roleKey: 'backend_manager',
    name: 'Backend Manager',
    department: 'Technology',
    description: 'API health, system settings, and integrations.',
  },
];

const PLATFORM_TEAM_ROLE_KEYS = PLATFORM_ROLE_CATALOG.map((row) => row.roleKey);

const PLATFORM_ROLES = new Set(['super_admin', ...PLATFORM_TEAM_ROLE_KEYS]);

function getRoleMeta(roleKey) {
  return PLATFORM_ROLE_CATALOG.find((row) => row.roleKey === roleKey) || null;
}

function isKnownPlatformTeamRole(role) {
  if (!role || role === 'super_admin') return false;
  return PLATFORM_TEAM_ROLE_KEYS.includes(role) || role.endsWith('_manager');
}

module.exports = {
  PLATFORM_ROLE_CATALOG,
  PLATFORM_TEAM_ROLE_KEYS,
  PLATFORM_ROLES,
  getRoleMeta,
  isKnownPlatformTeamRole,
};
