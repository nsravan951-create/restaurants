const PDFDocument = require('pdfkit');

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function buildInvoiceModel(order, restaurant, items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const gstPercent = Number(process.env.GST_PERCENT || 0);
  const gstAmount = subtotal * (gstPercent / 100);
  const grandTotal = subtotal + gstAmount;

  return {
    restaurant,
    order,
    items,
    subtotal,
    gstPercent,
    gstAmount,
    grandTotal,
    paymentLabel: order.payment_status === 'paid' ? 'Paid' : (order.payment_method === 'cod' ? 'COD' : 'Pending'),
  };
}

function renderInvoiceHtml(model) {
  const { restaurant, order, items, subtotal, gstPercent, gstAmount, grandTotal, paymentLabel } = model;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice #${escapeHtml(order.id)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #111; }
    .sheet { max-width: 760px; margin: 20px auto; background: #fff; padding: 24px; border: 1px solid #ddd; }
    .top { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 16px; }
    h1, h2, h3, p { margin: 0; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin-bottom: 16px; }
    .meta div, .summary div { display: flex; justify-content: space-between; gap: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border-bottom: 1px solid #e6e6e6; padding: 8px 4px; text-align: left; font-size: 14px; }
    th:last-child, td:last-child { text-align: right; }
    .summary { margin-top: 10px; border-top: 2px dashed #333; padding-top: 12px; }
    .summary div strong:last-child { min-width: 110px; text-align: right; display: inline-block; }
    .footer { text-align: center; margin-top: 18px; font-size: 12px; color: #555; border-top: 1px solid #eee; padding-top: 10px; }
    .small { font-size: 12px; color: #666; }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; border: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <h1>${escapeHtml(restaurant.name)}</h1>
      <p class="small">Powered by Online Solutionzzz</p>
    </div>

    <div class="meta">
      <div><span>Order ID</span><strong>#${escapeHtml(order.id)}</strong></div>
      <div><span>Table</span><strong>${escapeHtml(order.table_number)}</strong></div>
      <div><span>Date & Time</span><strong>${escapeHtml(new Date(order.created_at).toLocaleString())}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(paymentLabel)}</strong></div>
    </div>

    <div>
      <h3>Items</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.item_name)}</td>
              <td>${escapeHtml(item.quantity)}</td>
              <td>${formatMoney(item.item_price)}</td>
              <td>${formatMoney(item.line_total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="summary">
      <div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
      <div><span>GST ${gstPercent ? `(${gstPercent}%)` : ''}</span><strong>${formatMoney(gstAmount)}</strong></div>
      <div><span>Total Amount</span><strong>${formatMoney(grandTotal)}</strong></div>
    </div>

    <div class="footer">Powered by Online Solutionzzz</div>
  </div>
</body>
</html>`;
}

function buildInvoicePdf(res, model) {
  const { restaurant, order, items, subtotal, gstPercent, gstAmount, grandTotal, paymentLabel } = model;
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.id}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text(restaurant.name, { align: 'center' });
  doc.fontSize(10).text('Powered by Online Solutionzzz', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(12).text(`Invoice #${order.id}`);
  doc.text(`Table: ${order.table_number}`);
  doc.text(`Date & Time: ${new Date(order.created_at).toLocaleString()}`);
  doc.text(`Payment: ${paymentLabel}`);
  doc.moveDown(1);

  doc.fontSize(12).text('Items');
  doc.moveDown(0.25);
  items.forEach((item) => {
    doc.fontSize(10).text(`${item.item_name} x${item.quantity} @ ${formatMoney(item.item_price)} = ${formatMoney(item.line_total)}`);
  });

  doc.moveDown(1);
  doc.text(`Subtotal: ${formatMoney(subtotal)}`);
  doc.text(`GST${gstPercent ? ` (${gstPercent}%)` : ''}: ${formatMoney(gstAmount)}`);
  doc.text(`Total Amount: ${formatMoney(grandTotal)}`);
  doc.moveDown(2);
  doc.fontSize(10).text('Powered by Online Solutionzzz', { align: 'center' });

  doc.end();
}

module.exports = {
  buildInvoiceModel,
  renderInvoiceHtml,
  buildInvoicePdf,
};
