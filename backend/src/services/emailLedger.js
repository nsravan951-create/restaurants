/**
 * AutoResto Daily Settlement Ledger Email Service
 * Generates and dispatches responsive, high-fidelity financial ledger emails via Resend.
 */

function formatCurrency(amount) {
  return 'INR ' + Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generateLedgerEmailHtml({
  restaurantName,
  ownerName,
  dateFormatted,
  totalOrders,
  grossSales,
  refunds,
  commission,
  restaurantPayable,
  settlementStatus,
  settlementReference,
}) {
  const statusColor = settlementStatus === 'paid' ? '#059669' : (settlementStatus === 'processing' ? '#2563eb' : '#d97706');
  const statusBg = settlementStatus === 'paid' ? '#ecfdf5' : (settlementStatus === 'processing' ? '#eff6ff' : '#fffbeb');
  const statusText = (settlementStatus || 'Pending').toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoResto Daily Settlement Ledger</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 32px 16px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 32px;
      color: #ffffff;
      text-align: left;
    }
    .logo-badge {
      display: inline-block;
      background-color: #d94f2b;
      color: #ffffff;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 6px 0;
      color: #ffffff;
    }
    .subtitle {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }
    .content {
      padding: 32px;
    }
    .meta-card {
      background-color: #f8fafc;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .meta-row:last-child {
      margin-bottom: 0;
    }
    .meta-label {
      color: #64748b;
    }
    .meta-value {
      font-weight: 600;
      color: #0f172a;
    }
    .ledger-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .ledger-table th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .ledger-table td {
      padding: 14px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    .amount-col {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .highlight-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-weight: 700;
      font-size: 16px;
      color: #0f172a;
      padding: 16px 0;
    }
    .highlight-row .amount-col {
      color: #d94f2b;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background-color: ${statusBg};
      color: ${statusColor};
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
    .footer a {
      color: #d94f2b;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="logo-badge">AUTORESTO</span>
        <h1 class="title">Daily Settlement Ledger</h1>
        <p class="subtitle">${restaurantName} &bull; ${dateFormatted}</p>
      </div>
      <div class="content">
        <div class="meta-card">
          <div class="meta-row">
            <span class="meta-label">Restaurant Owner:</span>
            <span class="meta-value">${ownerName || 'Valued Partner'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Settlement Status:</span>
            <span class="meta-value"><span class="status-badge">${statusText}</span></span>
          </div>
          ${settlementReference ? `
          <div class="meta-row">
            <span class="meta-label">Payout Reference:</span>
            <span class="meta-value" style="font-family: monospace;">${settlementReference}</span>
          </div>` : ''}
        </div>

        <table class="ledger-table">
          <thead>
            <tr>
              <th>Financial Breakdown</th>
              <th class="amount-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Completed Orders</td>
              <td class="amount-col">${totalOrders} orders</td>
            </tr>
            <tr>
              <td>Gross Table Sales</td>
              <td class="amount-col">${formatCurrency(grossSales)}</td>
            </tr>
            <tr>
              <td>Customer Refunds / Cancellations</td>
              <td class="amount-col" style="color:#dc2626;">- ${formatCurrency(refunds)}</td>
            </tr>
            <tr>
              <td>AutoResto Platform Fee / Commission</td>
              <td class="amount-col" style="color:#64748b;">- ${formatCurrency(commission)}</td>
            </tr>
            <tr class="highlight-row">
              <td>Net Restaurant Payable</td>
              <td class="amount-col">${formatCurrency(restaurantPayable)}</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
          This ledger statement is automatically compiled from your verified Cash and Cashfree settled table orders.
          If you have any questions regarding your payout, please visit the <strong>AutoResto Owner Dashboard &rarr; Support</strong> or reply directly to this email.
        </p>
      </div>
      <div class="footer">
        <p style="margin:0 0 6px;">Powered by AutoResto &bull; Enterprise Restaurant Operating System</p>
        <p style="margin:0;">&copy; ${new Date().getFullYear()} AutoResto Technologies Pvt. Ltd. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendLedgerEmail({
  to,
  restaurantName,
  ownerName,
  dateFormatted,
  totalOrders,
  grossSales,
  refunds = 0,
  commission = 0,
  restaurantPayable,
  settlementStatus = 'pending',
  settlementReference = null,
}) {
  const html = generateLedgerEmailHtml({
    restaurantName,
    ownerName,
    dateFormatted,
    totalOrders,
    grossSales,
    refunds,
    commission,
    restaurantPayable,
    settlementStatus,
    settlementReference,
  });

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[AutoResto Resend Service] RESEND_API_KEY not configured. Mocking ledger email dispatch to:', to);
    return {
      success: true,
      mocked: true,
      message: 'Ledger email generated (simulated in sandbox/dev mode)',
      previewHtml: html,
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'AutoResto Ledger <ledger@autoresto.in>',
        to: [to],
        subject: `AutoResto Daily Settlement Ledger — ${restaurantName} (${dateFormatted})`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[AutoResto Resend Error]', data);
      return { success: false, error: data.message || 'Failed to send email via Resend' };
    }

    return { success: true, resendId: data.id };
  } catch (err) {
    console.error('[AutoResto Resend Exception]', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateLedgerEmailHtml,
  sendLedgerEmail,
};
