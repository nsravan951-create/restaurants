const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceModel } = require('../src/utils/invoice');

test('buildInvoiceModel exposes customer bill fields for paid orders', () => {
  const order = {
    id: 123,
    table_number: '7',
    customer_name: 'Guest',
    payment_status: 'paid',
    payment_method: 'cash',
    payment_provider: 'cash',
    total_amount: 250,
    subtotal_amount: 212,
    discount_amount: 0,
    taxable_amount: 212,
    cgst_amount: 19,
    sgst_amount: 19,
    igst_amount: 0,
    gst_rate: 18,
    invoice_number: 'INV-123',
    created_at: '2026-09-16T10:30:00.000Z',
  };
  const restaurant = {
    name: 'Niharika',
    legal_name: 'Niharika Foods',
    logo_url: 'https://example.com/logo.png',
    address: 'Hyderabad',
  };
  const items = [
    { item_name: 'Biryani', item_price: 200, quantity: 1, line_total: 200 },
    { item_name: 'Drink', item_price: 50, quantity: 1, line_total: 50 },
  ];

  const model = buildInvoiceModel(order, restaurant, items);

  assert.equal(model.invoiceNumber, 'INV-123');
  assert.equal(model.grandTotal, 250);
  assert.equal(model.items.length, 2);
  assert.equal(model.restaurant.displayName, 'Niharika Foods');
  assert.match(model.paymentLabel, /CASH/i);
});
