const test = require('node:test');
const assert = require('node:assert/strict');
const {
  orderMenuByCategories,
  filterMenuByActiveCategories,
} = require('../src/utils/menuCategories');

test('orderMenuByCategories respects display order', () => {
  const categories = [
    { name: 'Biryani', display_order: 0, is_active: true },
    { name: 'Drinks', display_order: 1, is_active: true },
  ];
  const menu = [
    { id: 1, name: 'Coke', category: 'Drinks' },
    { id: 2, name: 'Veg Biryani', category: 'Biryani' },
  ];
  const ordered = orderMenuByCategories(menu, categories);
  assert.equal(ordered[0].category, 'Biryani');
});

test('filterMenuByActiveCategories hides disabled categories', () => {
  const categories = [
    { name: 'Biryani', is_active: true },
    { name: 'Snacks', is_active: false },
  ];
  const menu = [
    { id: 1, name: 'Veg Biryani', category: 'Biryani' },
    { id: 2, name: 'Chips', category: 'Snacks' },
  ];
  const filtered = filterMenuByActiveCategories(menu, categories);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Veg Biryani');
});
