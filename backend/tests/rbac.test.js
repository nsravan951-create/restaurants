const test = require('node:test');
const assert = require('node:assert/strict');
const { restaurantScopeClause } = require('../src/utils/scopeUtils');

test('restaurantScopeClause returns no filter for global access', () => {
  const result = restaurantScopeClause('r.id', null, 1);
  assert.equal(result.clause, '');
  assert.deepEqual(result.params, []);
});

test('restaurantScopeClause scopes to assigned restaurants', () => {
  const result = restaurantScopeClause('o.restaurant_id', [1, 2], 3);
  assert.match(result.clause, /ANY\(\$3::int\[\]\)/);
  assert.deepEqual(result.params, [[1, 2]]);
});

test('restaurantScopeClause denies when no restaurants assigned', () => {
  const result = restaurantScopeClause('r.id', [], 1);
  assert.match(result.clause, /1=0/);
});
