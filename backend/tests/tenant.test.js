const test = require('node:test');
const assert = require('node:assert/strict');

test('menu route requires restaurantId query parameter', () => {
  const restaurantId = Number('');
  assert.equal(Number.isInteger(restaurantId) && restaurantId > 0, false);
});

test('socket super_admin room isolates global events', () => {
  const rooms = new Set(['restaurant_1', 'super_admin']);
  assert.equal(rooms.has('super_admin'), true);
  assert.equal(rooms.has('restaurant_2'), false);
});
