function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(date) {
  return new Date(date).toLocaleString('en-IN', { hour12: true });
}

function renderKotHtml({ restaurant, order, items, printType = 'kot' }) {
  const title = printType === 'reprint' ? 'KOT REPRINT' : 'KITCHEN ORDER TICKET';
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.item_name)}</td>
      <td style="text-align:center;font-weight:700;">${escapeHtml(item.quantity)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} #${escapeHtml(order.id)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; color: #000; font-size: 12px; }
    h1 { font-size: 14px; text-align: center; margin: 0 0 6px; }
    .meta { margin-bottom: 8px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 0; border-bottom: 1px dashed #000; vertical-align: top; }
    th { text-align: left; font-size: 11px; }
    .footer { margin-top: 10px; text-align: center; font-size: 11px; }
    @media print { body { width: 72mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <div><strong>${escapeHtml(restaurant.name)}</strong></div>
    <div>Order #${escapeHtml(order.id)} | Table ${escapeHtml(order.table_number)}</div>
    <div>${formatTime(order.created_at)}</div>
    ${order.customer_name ? `<div>Guest: ${escapeHtml(order.customer_name)}</div>` : ''}
    ${order.notes ? `<div>Notes: ${escapeHtml(order.notes)}</div>` : ''}
  </div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center;width:36px;">Qty</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">--- END KOT ---</div>
  <div class="no-print" style="margin-top:12px;text-align:center;">
    <button onclick="window.print()">Print Thermal</button>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body>
</html>`;
}

function renderThermalBillHtml(model) {
  const { restaurant, order, items, subtotal, discountAmount, taxableAmount, cgstAmount, sgstAmount, igstAmount, gstRate, grandTotal, paymentLabel, invoiceNumber } = model;
  const gstLines = igstAmount > 0
    ? `<div>IGST (${gstRate}%): ${Number(igstAmount).toFixed(2)}</div>`
    : `<div>CGST (${gstRate / 2}%): ${Number(cgstAmount).toFixed(2)}</div>
       <div>SGST (${gstRate / 2}%): ${Number(sgstAmount).toFixed(2)}</div>`;

  const itemRows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.item_name)}</td>
      <td style="text-align:center;">${escapeHtml(item.quantity)}</td>
      <td style="text-align:right;">${Number(item.line_total).toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Bill ${escapeHtml(invoiceNumber || order.id)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; font-size: 11px; color: #000; }
    h1 { font-size: 13px; text-align: center; margin: 0; }
    .small { font-size: 10px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { padding: 3px 0; border-bottom: 1px dashed #000; }
    .totals div { display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(restaurant.legal_name || restaurant.name)}</h1>
  ${restaurant.gstin ? `<div class="small">GSTIN: ${escapeHtml(restaurant.gstin)}</div>` : ''}
  <div class="small">${escapeHtml(restaurant.business_address || restaurant.address || '')}</div>
  <div class="small">Invoice: ${escapeHtml(invoiceNumber || `#${order.id}`)}</div>
  <div class="small">Table ${escapeHtml(order.table_number)} | ${formatTime(order.created_at)}</div>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th style="text-align:right;">Amt</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${Number(subtotal).toFixed(2)}</span></div>
    ${discountAmount > 0 ? `<div><span>Discount</span><span>-${Number(discountAmount).toFixed(2)}</span></div>` : ''}
    <div><span>Taxable</span><span>${Number(taxableAmount).toFixed(2)}</span></div>
    ${gstLines}
    <div><strong>Total</strong><strong>${Number(grandTotal).toFixed(2)}</strong></div>
    <div><span>Payment</span><span>${escapeHtml(paymentLabel)}</span></div>
  </div>
  <div class="small" style="margin-top:8px;">Thank you!</div>
  <div class="no-print" style="margin-top:10px;text-align:center;"><button onclick="window.print()">Print</button></div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body>
</html>`;
}

module.exports = { renderKotHtml, renderThermalBillHtml };
