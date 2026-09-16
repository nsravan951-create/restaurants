const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFeatureRow } = require('../src/utils/featureResolution');

test('admin disable overrides active plan', () => {
  const row = resolveFeatureRow({
    feature_key: 'inventory',
    name: 'Inventory',
    admin_enabled: false,
    admin_source: 'admin',
    override_id: 1,
    from_plan: true,
  });
  assert.equal(row.enabled, false);
  assert.equal(row.source, 'admin');
});

test('plan enables when no admin override', () => {
  const row = resolveFeatureRow({
    feature_key: 'billing',
    name: 'Billing',
    admin_enabled: null,
    override_id: null,
    from_plan: true,
  });
  assert.equal(row.enabled, true);
  assert.equal(row.source, 'plan');
});

test('admin enable works without plan', () => {
  const row = resolveFeatureRow({
    feature_key: 'loyalty',
    name: 'Loyalty',
    admin_enabled: true,
    admin_source: 'admin',
    override_id: 2,
    from_plan: false,
  });
  assert.equal(row.enabled, true);
});
