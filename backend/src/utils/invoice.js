const PDFDocument = require('pdfkit');
const { calculateGstBreakdown } = require('./gst');

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

function resolveTaxModel(order, restaurant, items) {
  const subtotal = order.subtotal_amount != null
    ? Number(order.subtotal_amount)
    : items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const discountAmount = Number(order.discount_amount || 0);
  const gstRate = order.gst_rate != null
    ? Number(order.gst_rate)
    : Number(restaurant?.default_gst_rate || process.env.GST_PERCENT || 0);

  if (order.taxable_amount != null) {
    const taxableAmount = Number(order.taxable_amount);
    const cgstAmount = Number(order.cgst_amount || 0);
    const sgstAmount = Number(order.sgst_amount || 0);
    const igstAmount = Number(order.igst_amount || 0);
    const gstAmount = cgstAmount + sgstAmount + igstAmount;
    const grandTotal = Number(order.total_amount || taxableAmount + gstAmount);
    return {
      subtotal,
      discountAmount,
      taxableAmount,
      gstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount,
      grandTotal,
    };
  }

  const breakdown = calculateGstBreakdown({
    subtotal,
    discountAmount,
    gstRate,
    isInterState: Boolean(order.is_inter_state),
  });
  return breakdown;
}

function buildInvoiceModel(order, restaurant, items) {
  const tax = resolveTaxModel(order, restaurant, items);
  const displayName = restaurant?.legal_name || restaurant?.name;
  const address = restaurant?.business_address || restaurant?.address || '';

  return {
    restaurant: { ...restaurant, displayName, address },
    order,
    items,
    ...tax,
    invoiceNumber: order.invoice_number || `ORD-${order.id}`,
    paymentLabel: order.payment_status === 'paid'
      ? `${order.payment_method || order.payment_provider || 'Paid'}`.toUpperCase()
      : 'Pending',
    logoUrl: restaurant?.logo_url || null,
    thankYouMessage: restaurant?.thank_you_message || process.env.BILL_THANK_YOU_MESSAGE || 'Thank you for visiting! Please come again.',
  };
}

function renderGstSummary(model) {
  const { discountAmount, taxableAmount, gstRate, cgstAmount, sgstAmount, igstAmount, grandTotal, subtotal } = model;
  const gstLines = igstAmount > 0
    ? `<div><span>IGST (${gstRate}%)</span><strong>${formatMoney(igstAmount)}</strong></div>`
    : `<div><span>CGST (${formatMoney(gstRate / 2)}%)</span><strong>${formatMoney(cgstAmount)}</strong></div>
       <div><span>SGST (${formatMoney(gstRate / 2)}%)</span><strong>${formatMoney(sgstAmount)}</strong></div>`;

  return `
    <div class="summary">
      <div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
      ${discountAmount > 0 ? `<div><span>Discount</span><strong>-${formatMoney(discountAmount)}</strong></div>` : ''}
      <div><span>Taxable Amount</span><strong>${formatMoney(taxableAmount)}</strong></div>
      ${gstRate > 0 ? gstLines : ''}
      <div><span>Grand Total</span><strong>${formatMoney(grandTotal)}</strong></div>
    </div>`;
}

function renderInvoiceHtml(model) {
  const {
    restaurant, order, items, paymentLabel, logoUrl, thankYouMessage, invoiceNumber,
  } = model;
  const hasLogo = Boolean(logoUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tax Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f7fb; color: #111; }
    .sheet { max-width: 820px; margin: 20px auto; background: #fff; padding: 28px; border: 1px solid #d7e0ea; border-radius: 12px; }
    .top { display: grid; grid-template-columns: 1fr auto; gap: 16px; border-bottom: 2px solid #0f2744; padding-bottom: 16px; margin-bottom: 16px; }
    .logo { max-width: 110px; max-height: 80px; object-fit: contain; }
    h1, h2, h3, p { margin: 0; }
    .tax-title { font-size: 1.35rem; color: #0f2744; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin-bottom: 16px; }
    .meta div, .summary div { display: flex; justify-content: space-between; gap: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border-bottom: 1px solid #e6edf5; padding: 10px 6px; text-align: left; font-size: 14px; }
    th { background: #f8fbff; color: #35506d; }
    th:last-child, td:last-child, th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { text-align: right; }
    .summary { margin-top: 10px; border-top: 2px solid #0f2744; padding-top: 12px; }
    .footer { text-align: center; margin-top: 18px; font-size: 12px; color: #5b6f86; border-top: 1px solid #eee; padding-top: 10px; }
    .small { font-size: 12px; color: #5b6f86; line-height: 1.5; }
    @media print { body { background: #fff; } .sheet { margin: 0; border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="tax-title">TAX INVOICE</div>
        <h1 style="margin-top:8px;">${escapeHtml(restaurant.displayName || restaurant.name)}</h1>
        <p class="small">${escapeHtml(restaurant.address || '')}</p>
        ${restaurant.gstin ? `<p class="small"><strong>GSTIN:</strong> ${escapeHtml(restaurant.gstin)}</p>` : ''}
        ${restaurant.fssai_license ? `<p class="small"><strong>FSSAI:</strong> ${escapeHtml(restaurant.fssai_license)}</p>` : ''}
        ${restaurant.state_name ? `<p class="small"><strong>State:</strong> ${escapeHtml(restaurant.state_name)} (${escapeHtml(restaurant.state_code || '')})</p>` : ''}
      </div>
      ${hasLogo ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="logo" />` : ''}
    </div>

    <div class="meta">
      <div><span>Invoice No.</span><strong>${escapeHtml(invoiceNumber)}</strong></div>
      <div><span>Order ID</span><strong>#${escapeHtml(order.id)}</strong></div>
      <div><span>Table</span><strong>${escapeHtml(order.table_number)}</strong></div>
      <div><span>Date & Time</span><strong>${escapeHtml(new Date(order.created_at).toLocaleString('en-IN'))}</strong></div>
      <div><span>Customer</span><strong>${escapeHtml(order.customer_name || 'Guest')}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(paymentLabel)}</strong></div>
    </div>

    <div>
      <h3>Items</h3>
      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
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

    ${renderGstSummary(model)}

    <div class="footer">
      <p style="margin-bottom: 6px;">${escapeHtml(thankYouMessage)}</p>
      <p>Powered by AutoResto / Online Solutionzzz</p>
    </div>
  </div>
</body>
</html>`;
}

function buildInvoicePdf(res, model) {
  const {
    restaurant, order, items, subtotal, discountAmount, taxableAmount,
    cgstAmount, sgstAmount, igstAmount, gstRate, grandTotal, paymentLabel,
    logoUrl, thankYouMessage, invoiceNumber,
  } = model;

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceNumber}.pdf`);
  doc.pipe(res);

  if (logoUrl) {
    try { doc.image(logoUrl, { fit: [120, 80], align: 'right' }); } catch (_) {}
  }

  doc.fontSize(18).text('TAX INVOICE', { align: 'left' });
  doc.fontSize(16).text(restaurant.displayName || restaurant.name);
  doc.fontSize(10).text(restaurant.address || '');
  if (restaurant.gstin) doc.text(`GSTIN: ${restaurant.gstin}`);
  doc.moveDown(0.5);
  doc.text(`Invoice: ${invoiceNumber}`);
  doc.text(`Order #${order.id} | Table ${order.table_number}`);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString('en-IN')}`);
  doc.text(`Payment: ${paymentLabel}`);
  doc.moveDown(0.8);

  items.forEach((item) => {
    doc.fontSize(10).text(`${item.item_name} x${item.quantity} @ ${formatMoney(item.item_price)} = ${formatMoney(item.line_total)}`);
  });

  doc.moveDown(0.8);
  doc.text(`Subtotal: ${formatMoney(subtotal)}`);
  if (discountAmount > 0) doc.text(`Discount: -${formatMoney(discountAmount)}`);
  doc.text(`Taxable: ${formatMoney(taxableAmount)}`);
  if (igstAmount > 0) doc.text(`IGST (${gstRate}%): ${formatMoney(igstAmount)}`);
  else {
    doc.text(`CGST (${formatMoney(gstRate / 2)}%): ${formatMoney(cgstAmount)}`);
    doc.text(`SGST (${formatMoney(gstRate / 2)}%): ${formatMoney(sgstAmount)}`);
  }
  doc.text(`Grand Total: ${formatMoney(grandTotal)}`);
  doc.moveDown(1);
  doc.fontSize(10).text(thankYouMessage, { align: 'center' });

  doc.end();
}

module.exports = {
  buildInvoiceModel,
  renderInvoiceHtml,
  buildInvoicePdf,
  resolveTaxModel,
};
