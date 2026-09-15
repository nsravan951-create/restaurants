function authHeaders() {
  const headers = { Accept: 'text/html,application/json' };
  try {
    const raw = localStorage.getItem('qr_ordering_auth');
    if (raw) {
      const auth = JSON.parse(raw);
      if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
    }
  } catch (_) {}
  return headers;
}

async function openAuthedPrint(path, label = 'Print') {
  const response = await fetch(`${window.API_URL}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `${label} failed`);
  }
  const html = await response.text();
  const win = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720');
  if (!win) throw new Error(`Popup blocked. Allow popups to ${label}.`);
  win.document.write(html);
  win.document.close();
  return win;
}

async function printKot(orderId, reprint = false) {
  return openAuthedPrint(`/orders/${orderId}/kot?reprint=${reprint ? 'true' : 'false'}`, 'print KOT');
}

async function printThermalBill(orderId) {
  return openAuthedPrint(`/orders/${orderId}/thermal-bill`, 'print thermal bill');
}

async function printInvoice(orderId) {
  return openAuthedPrint(`/orders/${orderId}/invoice?format=html`, 'print invoice');
}

window.PrintUtils = { printKot, printThermalBill, printInvoice };
