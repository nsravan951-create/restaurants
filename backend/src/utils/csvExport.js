function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowsToCsv(rows, columns) {
  const header = columns.map((col) => escapeCsvCell(col.label)).join(',');
  const lines = (rows || []).map((row) => columns.map((col) => {
    const raw = typeof col.value === 'function' ? col.value(row) : row[col.key];
    return escapeCsvCell(raw);
  }).join(','));
  return [header, ...lines].join('\r\n');
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}

module.exports = { escapeCsvCell, rowsToCsv, sendCsv };
