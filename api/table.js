const { createSupabaseServerClient } = require('./_lib/supabase');

function shouldReturnJson(req) {
  return req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'));
}

function toTableCandidates(rawTable) {
  const value = String(rawTable).trim();
  const candidates = [value];
  if (/^\d+$/.test(value)) {
    candidates.push(`Table ${value}`);
  }
  return [...new Set(candidates)];
}

module.exports = async function handler(req, res) {
  const restaurantIdRaw = req.query.restaurantId;
  const tableRaw = req.query.table;
  const wantsJson = shouldReturnJson(req);

  if (!restaurantIdRaw || !tableRaw) {
    if (wantsJson) {
      return res.status(400).json({ error: 'restaurantId and table query parameters are required' });
    }

    return res.status(400).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Invalid QR Code</title>
        </head>
        <body>
          <h2>Invalid QR Code</h2>
          <p>Required query params: restaurantId and table.</p>
        </body>
      </html>
    `);
  }

  const restaurantId = Number(restaurantIdRaw);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return res.status(400).json({ error: 'restaurantId must be a positive integer' });
  }

  try {
    const supabase = createSupabaseServerClient();
    const tableCandidates = toTableCandidates(tableRaw);

    const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, slug, phone, address, is_active')
      .eq('id', restaurantId)
      .limit(1)
      .maybeSingle();

    if (restaurantError) {
      throw restaurantError;
    }

    if (!restaurantData) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const { data: tableData, error: tableError } = await supabase
      .from('restaurant_tables')
      .select('id, restaurant_id, table_number, availability_status')
      .eq('restaurant_id', restaurantId)
      .in('table_number', tableCandidates)
      .limit(1)
      .maybeSingle();

    if (tableError) {
      throw tableError;
    }

    if (!tableData) {
      return res.status(404).json({ error: 'Table not found for this restaurant' });
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, status, total_amount, payment_status, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('table_id', tableData.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (ordersError) {
      throw ordersError;
    }

    if (wantsJson) {
      return res.status(200).json({
        ok: true,
        restaurantId,
        restaurant: restaurantData,
        table: tableData,
        orders: ordersData || [],
      });
    }

    const orderRows = (ordersData || [])
      .map((order) => `<li>#${order.id} - ${order.status} - INR ${order.total_amount} - ${order.payment_status}</li>`)
      .join('');

    return res.status(200).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${restaurantData.name} - ${tableData.table_number}</title>
        </head>
        <body>
          <h1>${restaurantData.name} - ${tableData.table_number}</h1>
          <p>Restaurant ID: ${restaurantData.id}</p>
          <p>Slug: ${restaurantData.slug || 'N/A'}</p>
          <p>Phone: ${restaurantData.phone || 'N/A'}</p>
          <p>Address: ${restaurantData.address || 'N/A'}</p>
          <p>Active: ${restaurantData.is_active ? 'Yes' : 'No'}</p>
          <p>Availability: ${tableData.availability_status}</p>
          <h2>Recent Orders</h2>
          <ul>${orderRows || '<li>No orders found</li>'}</ul>
          <p>Add <code>&format=json</code> for JSON output.</p>
        </body>
      </html>
    `);
  } catch (error) {
    const message = error && error.message ? error.message : 'Unhandled server error';
    return res.status(500).json({ error: message });
  }
};
