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

function isMissingColumnError(error) {
  return error?.code === '42703';
}

async function getRestaurantGstProfile(pool, restaurantId) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, legal_name, gstin, business_address, address, state_name, state_code,
              default_gst_rate, invoice_prefix, fssai_license, thank_you_message, logo_url
       FROM restaurants WHERE id = $1 LIMIT 1`,
      [restaurantId]
    );
    return rows[0] || null;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const { rows } = await pool.query(
      'SELECT id, name, address, thank_you_message, logo_url FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    return rows[0] || null;
  }
}

async function resolveRestaurantGstRate(conn, restaurantId) {
  try {
    const { rows } = await conn.query(
      'SELECT default_gst_rate FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    return Number(rows[0]?.default_gst_rate ?? process.env.GST_PERCENT ?? 0);
  } catch (error) {
    if (isMissingColumnError(error)) {
      return Number(process.env.GST_PERCENT || 0);
    }
    throw error;
  }
}

async function insertOrderRecord(conn, {
  data,
  tableNumber,
  tax,
  couponCode,
  paymentMethod,
  notes,
  idempotencyKey,
}) {
  try {
    const orderResult = await conn.query(
      `INSERT INTO orders (
         restaurant_id, table_id, table_session_id, table_number, customer_name,
         total_amount, subtotal_amount, discount_amount, taxable_amount,
         cgst_amount, sgst_amount, igst_amount, gst_rate,
         coupon_code, status, payment_method, payment_provider,
         payment_status, notes, idempotency_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $15, 'pending', $16, $17)
       RETURNING id`,
      [
        data.restaurantId,
        data.tableId,
        data.tableSessionId,
        tableNumber,
        data.customerName,
        tax.grandTotal,
        tax.subtotal,
        tax.discountAmount,
        tax.taxableAmount,
        tax.cgstAmount,
        tax.sgstAmount,
        tax.igstAmount,
        tax.gstRate,
        couponCode,
        paymentMethod,
        notes,
        idempotencyKey,
      ]
    );
    return orderResult.rows[0].id;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }

  try {
    const orderResult = await conn.query(
      `INSERT INTO orders (
         restaurant_id, table_id, table_session_id, table_number, customer_name,
         total_amount, discount_amount, coupon_code, status, payment_method, payment_provider,
         payment_status, notes, idempotency_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $9, 'pending', $10, $11)
       RETURNING id`,
      [
        data.restaurantId,
        data.tableId,
        data.tableSessionId,
        tableNumber,
        data.customerName,
        tax.grandTotal,
        tax.discountAmount,
        couponCode,
        paymentMethod,
        notes,
        idempotencyKey,
      ]
    );
    return orderResult.rows[0].id;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }

  const orderResult = await conn.query(
    `INSERT INTO orders (
       restaurant_id, table_id, table_session_id, table_number, customer_name,
       total_amount, status, payment_method, payment_provider, payment_status, notes, idempotency_key
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7, 'pending', $8, $9)
     RETURNING id`,
    [
      data.restaurantId,
      data.tableId,
      data.tableSessionId,
      tableNumber,
      data.customerName,
      tax.grandTotal,
      paymentMethod,
      notes,
      idempotencyKey,
    ]
  );
  return orderResult.rows[0].id;
}

async function assignInvoiceNumber(conn, orderId, restaurantId) {
  try {
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
      'UPDATE orders SET invoice_number = $1 WHERE id = $2',
      [invoiceNumber, orderId]
    );

    return invoiceNumber;
  } catch (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }
}

module.exports = {
  roundMoney,
  calculateGstBreakdown,
  getRestaurantGstProfile,
  resolveRestaurantGstRate,
  insertOrderRecord,
  assignInvoiceNumber,
  isMissingColumnError,
};
