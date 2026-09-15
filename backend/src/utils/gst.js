function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calculateGstBreakdown({
  subtotal,
  discountAmount = 0,
  gstRate = 5,
  isInterState = false,
}) {
  const taxableAmount = roundMoney(Math.max(0, subtotal - discountAmount));
  const totalGst = roundMoney(taxableAmount * (Number(gstRate) / 100));
  const grandTotal = roundMoney(taxableAmount + totalGst);

  if (isInterState) {
    return {
      subtotal: roundMoney(subtotal),
      discountAmount: roundMoney(discountAmount),
      taxableAmount,
      gstRate: Number(gstRate),
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: totalGst,
      gstAmount: totalGst,
      grandTotal,
    };
  }

  const half = roundMoney(totalGst / 2);
  return {
    subtotal: roundMoney(subtotal),
    discountAmount: roundMoney(discountAmount),
    taxableAmount,
    gstRate: Number(gstRate),
    cgstAmount: half,
    sgstAmount: roundMoney(totalGst - half),
    igstAmount: 0,
    gstAmount: totalGst,
    grandTotal,
  };
}

async function getRestaurantGstProfile(pool, restaurantId) {
  const { rows } = await pool.query(
    `SELECT id, name, legal_name, gstin, business_address, address, state_name, state_code,
            default_gst_rate, invoice_prefix, fssai_license, thank_you_message, logo_url
     FROM restaurants WHERE id = $1 LIMIT 1`,
    [restaurantId]
  );
  return rows[0] || null;
}

async function assignInvoiceNumber(conn, orderId, restaurantId) {
  const { rows } = await conn.query(
    `UPDATE restaurants
     SET invoice_counter = invoice_counter + 1
     WHERE id = $1
     RETURNING invoice_prefix, invoice_counter`,
    [restaurantId]
  );
  if (!rows.length) return null;

  const prefix = String(rows[0].invoice_prefix || 'INV').replace(/[^A-Z0-9-]/gi, '') || 'INV';
  const invoiceNumber = `${prefix}-${String(rows[0].invoice_counter).padStart(6, '0')}`;

  await conn.query(
    `UPDATE orders SET invoice_number = $1 WHERE id = $2`,
    [invoiceNumber, orderId]
  );

  return invoiceNumber;
}

module.exports = {
  roundMoney,
  calculateGstBreakdown,
  getRestaurantGstProfile,
  assignInvoiceNumber,
};
