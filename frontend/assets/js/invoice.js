function parseOrderId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function renderInvoice(invoice) {
  const itemsHtml = invoice.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.item_name)}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${formatMoney(item.item_price)}</td>
      <td>${formatMoney(item.line_total)}</td>
    </tr>
  `).join('');

  document.getElementById('invoiceRoot').innerHTML = `
    <div class="top" style="text-align:center;border-bottom:2px dashed #333;padding-bottom:12px;margin-bottom:16px;">
      <h1 style="font-family:Fraunces,serif;margin:0;">${escapeHtml(invoice.restaurant.name)}</h1>
      <p style="font-size:12px;color:#666;margin:0;">Powered by Online Solutionzzz</p>
    </div>
    <div class="meta" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin-bottom:16px;font-family:Sora,sans-serif;">
      <div style="display:flex;justify-content:space-between;"><span>Order ID</span><strong>#${escapeHtml(invoice.order.id)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Table</span><strong>${escapeHtml(invoice.order.table_number)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Date & Time</span><strong>${escapeHtml(new Date(invoice.order.created_at).toLocaleString())}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Payment</span><strong>${escapeHtml(invoice.paymentLabel)}</strong></div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:8px 4px;">Item</th>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:8px 4px;">Qty</th>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:8px 4px;">Price</th>
          <th style="text-align:right;border-bottom:1px solid #ddd;padding:8px 4px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="border-top:2px dashed #333;margin-top:14px;padding-top:12px;font-family:Sora,sans-serif;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${formatMoney(invoice.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>GST ${invoice.gstPercent ? `(${invoice.gstPercent}%)` : ''}</span><strong>${formatMoney(invoice.gstAmount)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:1.05rem;margin-top:4px;"><span>Total Amount</span><strong>${formatMoney(invoice.grandTotal)}</strong></div>
    </div>
    <div style="text-align:center;margin-top:18px;font-size:12px;color:#666;">Powered by Online Solutionzzz</div>
  `;

  const pdfBtn = document.getElementById('pdfBtn');
  pdfBtn.href = '#';
  pdfBtn.onclick = async (event) => {
    event.preventDefault();
    try {
      const auth = getAuth();
      const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/orders/${invoice.order.id}/invoice?format=pdf`, {
        headers: {
          Authorization: auth?.token ? `Bearer ${auth.token}` : '',
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'PDF download failed');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `invoice-${invoice.order.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      document.getElementById('invoiceRoot').setAttribute('data-error', error.message);
      alert(error.message);
    }
  };
}

async function initInvoicePage() {
  const orderId = parseOrderId();
  if (!orderId) {
    document.getElementById('invoiceRoot').textContent = 'Missing orderId';
    return;
  }

  try {
    const data = await apiRequest(`/orders/${orderId}/invoice-data`, {}, true);
    renderInvoice(data.invoice);
    setTimeout(() => window.print(), 400);
  } catch (error) {
    document.getElementById('invoiceRoot').textContent = error.message;
  }
}

document.getElementById('printBtn').addEventListener('click', () => window.print());
initInvoicePage();
