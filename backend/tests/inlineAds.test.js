const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isInlineAdEligibleForRestaurant,
  resolveInlineFrequency,
  adsForSlot,
  buildInlineMenuStream,
} = require('../src/utils/inlineAds');

test('global inline ad is eligible for any restaurant', () => {
  const ad = { target_scope: 'all', restaurant_id: null, target_restaurant_ids: [] };
  assert.equal(isInlineAdEligibleForRestaurant(ad, 12), true);
});

test('selected targeting only allows chosen restaurants', () => {
  const ad = {
    target_scope: 'selected',
    restaurant_id: null,
    target_restaurant_ids: [5, 8],
  };
  assert.equal(isInlineAdEligibleForRestaurant(ad, 5), true);
  assert.equal(isInlineAdEligibleForRestaurant(ad, 2), false);
});

test('buildInlineMenuStream inserts ads after configured frequency', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }];
  const ads = [{ id: 10, display_order: 0, inline_frequency: 3 }];
  const stream = buildInlineMenuStream(items, ads, 3);

  assert.equal(stream.filter((entry) => entry.type === 'food').length, 6);
  assert.equal(stream.filter((entry) => entry.type === 'ad').length, 2);
});

test('adsForSlot rotates creatives per slot', () => {
  const ads = [
    { id: 1, display_order: 0 },
    { id: 2, display_order: 1 },
    { id: 3, display_order: 2 },
  ];

  assert.deepEqual(adsForSlot(ads, 1).map((ad) => ad.id), [1, 2, 3]);
  assert.deepEqual(adsForSlot(ads, 2).map((ad) => ad.id), [2, 3, 1]);
});

test('resolveInlineFrequency uses highest-priority ad frequency', () => {
  const ads = [
    { id: 1, display_order: 0, inline_frequency: 4 },
    { id: 2, display_order: 1, inline_frequency: 2 },
  ];
  assert.equal(resolveInlineFrequency(ads), 4);
});
