const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeCsvCell, rowsToCsv } = require('../src/utils/csvExport');

test('escapeCsvCell quotes values with commas', () => {
  assert.equal(escapeCsvCell('hello, world'), '"hello, world"');
});

test('rowsToCsv builds header and rows', () => {
  const csv = rowsToCsv(
    [{ id: 1, name: 'Test' }],
    [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }]
  );
  assert.match(csv, /^ID,Name/);
  assert.match(csv, /1,Test/);
});
