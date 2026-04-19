module.exports = function handler(req, res) {
  const restaurantId = req.query.restaurantId || '';
  const table = req.query.table || '';
  const wantsJson =
    req.query.format === 'json' ||
    (req.headers.accept && req.headers.accept.includes('application/json'));

  if (!restaurantId || !table) {
    if (wantsJson) {
      return res.status(400).json({
        error: 'restaurantId and table query parameters are required',
      });
    }

    return res.status(400).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Invalid QR Code</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 2rem; }
            .card { max-width: 520px; padding: 1rem 1.25rem; border: 1px solid #ddd; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Invalid QR Code</h2>
            <p>Required query params: restaurantId and table.</p>
          </div>
        </body>
      </html>
    `);
  }

  if (wantsJson) {
    return res.status(200).json({
      ok: true,
      restaurantId,
      table,
      message: 'Table route resolved successfully',
    });
  }

  return res.status(200).send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Table Session</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 2rem; }
          .card { max-width: 680px; padding: 1rem 1.25rem; border: 1px solid #ddd; border-radius: 10px; }
          code { background: #f7f7f7; padding: 2px 4px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Table Page Loaded</h1>
          <p>Restaurant ID: <strong>${String(restaurantId)}</strong></p>
          <p>Table: <strong>${String(table)}</strong></p>
          <p>Use <code>?format=json</code> to get JSON response.</p>
        </div>
      </body>
    </html>
  `);
};
