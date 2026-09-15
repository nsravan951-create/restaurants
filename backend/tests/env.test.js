const test = require('node:test');
const assert = require('node:assert/strict');

test('production rejects missing JWT_SECRET', () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  delete require.cache[require.resolve('../src/config/env')];
  const { getJwtSecret } = require('../src/config/env');
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env = previous;
  delete require.cache[require.resolve('../src/config/env')];
});

test('development rejects empty JWT_SECRET', () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'development';
  delete process.env.JWT_SECRET;
  delete require.cache[require.resolve('../src/config/env')];
  const { getJwtSecret } = require('../src/config/env');
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env = previous;
  delete require.cache[require.resolve('../src/config/env')];
});
