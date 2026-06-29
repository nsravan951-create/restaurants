let restaurantId = null;
let latestOrders = [];
let restaurantProfile = null;
let menuItemsCache = [];
let activeBillOrder = null;
let activeBillTableId = null;

function ensureRestaurantId() {
  if (!restaurantId) {
    console.error('Restaurant ID missing');
    setMessage('ownerMessage', 'Restaurant ID missing', true);
    return false;
  }
  return true;
}

function mustOwnerAuth() {
  const auth = getAuth();
  if (!auth || !auth.token || auth.user.role !== 'owner') {
    window.location.href = './auth.html';
    return null;
  }
  return auth;
}

function parseOrderItems(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function buildItemsList(items) {
  const parsed = parseOrderItems(items);
  if (!parsed.length) {
    return 'Unable to parse order items';
  }

  return parsed.map((item) => `${item.item_name} x${item.quantity}`).join(', ');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setPaymentSettingsEditable(isEditable) {
  const form = document.getElementById('paymentSettingsForm');
  const saveButton = document.getElementById('savePaymentDetailsBtn');
  const editButton = document.getElementById('editPaymentDetailsBtn');

  if (!form) return;

  form.querySelectorAll('input').forEach((input) => {
    input.disabled = !isEditable;
  });

  if (saveButton) saveButton.disabled = !isEditable;
  if (editButton) editButton.disabled = isEditable;
}

function openPaymentAuthModal() {
  const modal = document.getElementById('paymentAuthModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bill-modal-open');
  const passwordInput = document.getElementById('paymentAuthPassword');
  if (passwordInput) passwordInput.focus();
}

function closePaymentAuthModal() {
  const modal = document.getElementById('paymentAuthModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bill-modal-open');
}

async function fetchAuthorizedHtml(path) {
  const rawAuth = localStorage.getItem('qr_ordering_auth');
  let auth = null;
  try {
    auth = rawAuth ? JSON.parse(rawAuth) : null;
  } catch (error) {
    auth = null;
  }
  const response = await fetch(`${window.API_URL}${path}`, {
    headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : {},
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Request failed');
  }

  return response.text();
}

function hasRunningBill(table) {
  return Boolean(table.active_order_id)
    && String(table.order_payment_status || '').toLowerCase() === 'pending';
}

function tableStatusLabel(table) {
  const status = String(table.availability_status || 'available');
  if (status === 'paid') return 'Paid — tap for receipt';
  if (hasRunningBill(table)) return 'Running bill — tap to add items';
  if (status === 'active') return 'QR scanned — waiting for order';
  return 'Available';
}

function tablePaymentPill(table) {
  const method = String(table.order_payment_method || '').toLowerCase();
  const payStatus = String(table.order_payment_status || '').toLowerCase();
  if (table.availability_status === 'paid') {
    if (method === 'cash' || method === 'cod') {
      return '<span class="table-card__pay-pill table-card__pay-pill--cash">CASH</span>';
    }
    if (method === 'upi' || method === 'online') {
      return '<span class="table-card__pay-pill table-card__pay-pill--upi">UPI</span>';
    }
    return '<span class="table-card__pay-pill table-card__pay-pill--upi">PAID</span>';
  }
  if (table.active_order_id && payStatus === 'pending') {
    return '<span class="table-card__pay-pill table-card__pay-pill--bill">BILL OPEN</span>';
  }
  return '';
}

function buildUpiPayUrl({ vpa, name, amount, note }) {
  const params = new URLSearchParams({
    pa: vpa,
    pn: name || 'Restaurant',
    am: Number(amount || 0).toFixed(2),
    cu: 'INR',
    tn: note || 'Table bill',
  });
  return `upi://pay?${params.toString()}`;
}

function tableStatusClass(status) {
  if (status === 'active') return 'table-card--active';
  if (status === 'paid') return 'table-card--paid';
  return 'table-card--available';
}

function tableBadgeClass(status) {
  if (status === 'active') return 'table-card__badge table-card__badge--active';
  if (status === 'paid') return 'table-card__badge table-card__badge--paid';
  return 'table-card__badge table-card__badge--available';
}

function applyTableCardStatus(tableId, status) {
  const card = document.querySelector(`[data-table-id="${tableId}"]`);
  if (!card) return;

  const normalized = String(status || 'available');
  card.className = `table-card ${tableStatusClass(normalized)}`;
  card.dataset.tableStatus = normalized;

  const badge = card.querySelector('.table-card__badge');
  if (badge) {
    badge.className = tableBadgeClass(normalized);
    if (card.dataset.tableNumber) badge.textContent = card.dataset.tableNumber;
  }

  const statusMeta = card.querySelector('.table-card__meta');
  if (statusMeta) {
    statusMeta.textContent = `Status: ${tableStatusLabel({ availability_status: normalized, active_order_id: card.dataset.hasOrder === '1' ? 1 : null, order_payment_status: normalized === 'paid' ? 'paid' : (card.dataset.runningBill === '1' ? 'pending' : '') })}`;
  }
}

function showBillModal() {
  const modal = document.getElementById('billModal');
  if (!modal) return;
  modal.classList.add('is-open');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bill-modal-open');
}

function hideBillModal() {
  const modal = document.getElementById('billModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bill-modal-open');
  document.getElementById('billAddSection')?.classList.add('hidden');
  document.getElementById('billStaffConfirm')?.classList.add('hidden');
  document.getElementById('billPaidActions')?.classList.add('hidden');
  activeBillOrder = null;
  activeBillTableId = null;
}

function fillBillMenuSelect() {
  const select = document.getElementById('billMenuSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Select menu item</option>' + menuItemsCache.map((item) => (
    `<option value="${item.id}" data-price="${item.price}">${escapeHtml(item.name)} — INR ${formatCurrency(item.price)}</option>`
  )).join('');
}

function renderBillModal(order, tableId) {
  activeBillOrder = order;
  activeBillTableId = tableId;
  const items = parseOrderItems(order.items);
  const restaurantName = order.restaurant_name || restaurantProfile?.name || 'Restaurant';

  document.getElementById('billRestaurantName').textContent = restaurantName;
  document.getElementById('billTableMeta').textContent = `Table ${order.table_number || ''} • Order #${order.id} • ${order.customer_name || 'Guest'}`;
  document.getElementById('billOrderInfo').innerHTML = `
    <p><strong>${escapeHtml(restaurantName)}</strong></p>
    <p>${escapeHtml(order.bank_name || restaurantProfile?.bank_name || '')} ${escapeHtml(order.bank_account_name || restaurantProfile?.bank_account_name || '')}</p>
    <p>UPI: ${escapeHtml(order.upi_vpa || restaurantProfile?.upi_vpa || 'Not set')}</p>
  `;

  document.getElementById('billItemsBody').innerHTML = items.length ? items.map((it) => `
    <tr>
      <td>${escapeHtml(it.item_name)}</td>
      <td>${it.quantity}</td>
      <td>INR ${formatCurrency(it.item_price || it.unit_price)}</td>
      <td>INR ${formatCurrency(it.line_total)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4">No items</td></tr>';

  document.getElementById('billGrandTotal').textContent = `INR ${formatCurrency(order.total_amount)}`;

  const isPaid = String(order.payment_status || '').toLowerCase() === 'paid';
  const isRunning = !isPaid;

  document.getElementById('billAddSection').classList.toggle('hidden', !isRunning);
  document.getElementById('billPaidActions').classList.toggle('hidden', !isPaid);

  const method = String(order.payment_method || '').toLowerCase();
  const showStaffCashConfirm = isRunning && (method === 'cash' || method === 'cod');
  document.getElementById('billStaffConfirm')?.classList.toggle('hidden', !showStaffCashConfirm);

  const billTitle = document.getElementById('billModalEyebrow');
  if (billTitle) {
    billTitle.textContent = isRunning ? 'Running bill' : 'Paid bill';
  }

  if (isRunning) {
    fillBillMenuSelect();
  }
  document.getElementById('billPaidMessage').textContent = isPaid
    ? `Payment received via ${String(order.payment_method || '').toUpperCase()}. Thank you — visit again!`
    : '';

}

async function openBillModalForTable(tableId, { allowPaid = false } = {}) {
  try {
    const pendingQuery = allowPaid ? '' : '?pendingOnly=true';
    const res = await apiRequest(`/orders/table/${tableId}/active${pendingQuery}`, {}, true);
    const order = res.order || null;

    if (!order) {
      setMessage('ownerMessage', 'No running bill on this table yet. Wait until a guest taps Book Food.', true);
      return;
    }

    const isPaid = String(order.payment_status || '').toLowerCase() === 'paid';
    if (isPaid && !allowPaid) {
      setMessage('ownerMessage', 'This bill is already paid. Tap a green table for receipt.', false);
      return;
    }

    if (!isPaid && !allowPaid) {
      const items = parseOrderItems(order.items);
      if (!items.length) {
        setMessage('ownerMessage', 'Bill has no items yet. Add items after the guest books food.', true);
      }
    }

    renderBillModal(order, tableId);
    showBillModal();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
}

async function markBillPaid(method, customerUpi = '') {
  if (!activeBillOrder) return;
  await apiRequest(`/orders/${activeBillOrder.id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ method, customerUpi }),
  }, true);
  hideBillModal();
  setMessage('ownerMessage', method === 'cash' ? 'Cash recorded — table is green.' : 'UPI payment confirmed.');
  await loadTables();
  await loadInvoices();
}

function setActiveSection(sectionName) {
  document.querySelectorAll('[data-owner-section-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.ownerSectionPanel !== sectionName);
  });

  document.querySelectorAll('[data-owner-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.ownerSection === sectionName);
  });
}

async function activateSection(sectionName) {
  setActiveSection(sectionName);

  const loaders = {
    tables: loadTables,
    menu: loadMenu,
    analytics: loadAnalytics,
    invoices: loadInvoices,
  };

  if (loaders[sectionName]) {
    await loaders[sectionName]();
  }
}

async function loadRestaurant() {
  const data = await apiRequest('/restaurants/owner/me', {}, true);
  restaurantProfile = data.restaurant;
  restaurantId = data.restaurant.id;
  document.getElementById('ownerRestaurantName').textContent = `${data.restaurant.name} Dashboard`;

  const payForm = document.getElementById('paymentSettingsForm');
  if (payForm) {
    payForm.upiVpa.value = data.restaurant.upi_vpa || '';
    payForm.bankAccountName.value = data.restaurant.bank_account_name || '';
    payForm.bankName.value = data.restaurant.bank_name || '';
    setPaymentSettingsEditable(false);
  }
}

async function loadMenu() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/menu/${restaurantId}`, {}, true);
  const menuList = document.getElementById('menuList');
  const items = data.menu || [];
  menuItemsCache = items;

  menuList.innerHTML = items.length ? items.map((item) => `
    <div class="card">
      <strong>${escapeHtml(item.name)}</strong>
      <p>${escapeHtml(item.category)} | INR ${formatCurrency(item.price)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-edit-item="${encodeURIComponent(JSON.stringify(item))}">Edit</button>
        <button class="btn btn-light" data-delete="${item.id}">Delete</button>
      </div>
    </div>
  `).join('') : '<p>No food items yet.</p>';

  menuList.querySelectorAll('button[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/menu/${button.dataset.delete}`, { method: 'DELETE' }, true);
        await loadMenu();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  menuList.querySelectorAll('button[data-edit-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = JSON.parse(decodeURIComponent(button.dataset.editItem));
      const form = document.getElementById('menuEditForm');
      form.classList.remove('hidden');
      form.itemId.value = item.id;
      form.name.value = item.name;
      form.price.value = item.price;
      form.category.value = item.category;
      form.imageUrl.value = item.image_url || '';
      form.description.value = item.description || '';
    });
  });
}

async function loadTables() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/restaurants/${restaurantId}/tables`, {}, true);
  const tableList = document.getElementById('tableList');
  const tables = data.tables || [];

  tableList.innerHTML = tables.length ? tables.map((table) => {
    const qrImage = table.qr_data_url ? `<img src="${table.qr_data_url}" alt="QR for ${escapeHtml(table.table_number)}" class="table-card__qr" />` : '';
    const hasActiveSession = Boolean(table.active_session_id) || String(table.active_session_status || '').toLowerCase() === 'active';
    const runningBill = hasRunningBill(table);
    const hasOrder = table.active_order_id ? '1' : '0';
    const status = String(table.availability_status || 'available') === 'paid'
      ? 'paid'
      : (runningBill || hasActiveSession ? 'active' : 'available');
    const clickable = runningBill || status === 'active' || status === 'paid';
    const showTerminate = status !== 'available';
    const showBillAction = runningBill || status === 'active' || status === 'paid';
    return `
      <div class="table-card ${tableStatusClass(status)}${clickable ? ' table-card--clickable' : ''}" data-table-id="${table.id}" data-table-status="${escapeHtml(status)}" data-table-number="${escapeHtml(table.table_number)}" data-has-order="${hasOrder}" data-running-bill="${runningBill ? '1' : '0'}">
        <div class="${tableBadgeClass(status)}">${escapeHtml(table.table_number)}</div>
        <p class="table-card__meta">Status: ${escapeHtml(tableStatusLabel(table))}</p>
        ${tablePaymentPill(table)}
        ${qrImage}
        <div class="toolbar">
          <button class="btn btn-light" data-print-qr="${table.id}" type="button">Print QR</button>
          ${showBillAction ? `<button class="btn btn-primary" data-open-bill="${table.id}" type="button">Open Bill</button>` : ''}
          ${showTerminate ? `<button class="btn btn-primary" data-reset-terminal="${table.id}" type="button">Terminate Box</button>` : ''}
          <button class="btn btn-dark" data-delete-table="${table.id}" type="button">Delete</button>
        </div>
      </div>
    `;
  }).join('') : '<p>No tables yet. Generate QR codes to create white table boxes.</p>';

  tableList.querySelectorAll('button[data-delete-table]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/restaurants/${restaurantId}/tables/${button.dataset.deleteTable}`, { method: 'DELETE' }, true);
        await loadTables();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  tableList.querySelectorAll('button[data-print-qr]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const qr = await apiRequest(`/restaurants/${restaurantId}/tables/${button.dataset.printQr}/qr`, {}, true);
        const html = `
          <html><body style="font-family:sans-serif;padding:20px;">
            <h2>Table QR</h2>
            <img src="${qr.qrDataUrl}" style="width:260px;height:260px;" />
            <p>${qr.url}</p>
          </body></html>
        `;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  tableList.querySelectorAll('button[data-open-bill]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const tableId = Number(button.dataset.openBill);
      const card = button.closest('.table-card');
      if (card?.dataset.runningBill === '1') {
        await openBillModalForTable(tableId, { allowPaid: false });
        return;
      }
      if (card?.dataset.tableStatus === 'paid') {
        await openBillModalForTable(tableId, { allowPaid: true });
        return;
      }
      await openBillModalForTable(tableId, { allowPaid: false });
    });
  });

  tableList.querySelectorAll('.table-card--clickable').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      const tableId = Number(card.dataset.tableId);
      if (card.dataset.runningBill === '1') {
        openBillModalForTable(tableId, { allowPaid: false });
        return;
      }
      if (card.dataset.tableStatus === 'paid') {
        openBillModalForTable(tableId, { allowPaid: true });
      }
    });
  });

  tableList.querySelectorAll('button[data-reset-terminal]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/restaurants/${restaurantId}/tables/${button.dataset.resetTerminal}/terminal-reset`, { method: 'POST' }, true);
        setMessage('ownerMessage', 'Table terminated and reset to available.');
        await loadTables();
        await loadInvoices();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

}

function renderAnalytics(orders) {
  const parsedOrders = Array.isArray(orders) ? orders : [];
  const itemMap = new Map();

  parsedOrders.forEach((order) => {
    parseOrderItems(order.items).forEach((item) => {
      const name = String(item.item_name || 'Unknown item');
      const quantity = Number(item.quantity || 0);
      itemMap.set(name, (itemMap.get(name) || 0) + quantity);
    });
  });

  const rankedItems = Array.from(itemMap.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name));

  const totalMoney = parsedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const paidRevenue = parsedOrders
    .filter((order) => String(order.payment_status || '').toLowerCase() === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const readyCount = parsedOrders.filter((order) => order.status === 'ready').length;
  const totalItems = rankedItems.reduce((sum, item) => sum + item.quantity, 0);
  const topFood = rankedItems[0] || null;

  const summary = document.getElementById('analyticsSummary');
  summary.innerHTML = `
    <div class="card"><strong>Total Orders</strong><p>${parsedOrders.length}</p></div>
    <div class="card"><strong>Total Money</strong><p>INR ${formatCurrency(totalMoney)}</p></div>
    <div class="card"><strong>Paid Revenue</strong><p>INR ${formatCurrency(paidRevenue)}</p></div>
    <div class="card"><strong>Food Items Ordered</strong><p>${totalItems}</p></div>
  `;

  const topFoodList = document.getElementById('topFoodList');
  topFoodList.innerHTML = topFood ? `
    <div class="analytics-item">
      <strong>${escapeHtml(topFood.name)}</strong>
      <p>${topFood.quantity} total orders</p>
    </div>
  ` : '<p>No order data yet.</p>';

  const orderList = document.getElementById('analyticsOrderList');
  const recentOrders = parsedOrders.slice(0, 5);
  orderList.innerHTML = recentOrders.length ? recentOrders.map((order) => `
    <div class="analytics-item">
      <strong>Order #${order.id} | Table ${escapeHtml(order.table_number || '')}</strong>
      <p>${escapeHtml(String(order.status || 'unknown'))} • INR ${formatCurrency(order.total_amount)}</p>
    </div>
  `).join('') : '<p>No recent orders.</p>';

  if (readyCount > 0) {
    const readyMarker = document.createElement('p');
    readyMarker.className = 'hero-copy';
    readyMarker.textContent = `${readyCount} orders are ready right now.`;
    if (!document.getElementById('analyticsOrderList').querySelector('.analytics-ready-note')) {
      readyMarker.classList.add('analytics-ready-note');
      orderList.prepend(readyMarker);
    }
  }
}

async function loadAnalytics() {
  if (!ensureRestaurantId()) return;

  if (!latestOrders.length) {
    const data = await apiRequest(`/orders/restaurant/${restaurantId}`, {}, true);
    latestOrders = data.orders || [];
  }

  renderAnalytics(latestOrders);
}

async function loadOrders() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/orders/restaurant/${restaurantId}`, {}, true);
  latestOrders = data.orders || [];
  const kitchenOrders = latestOrders.filter((order) => order.status === 'pending' || order.status === 'preparing');
  const readyOrders = latestOrders.filter((order) => order.status === 'ready');

  const kitchenContainer = document.getElementById('kitchenOrders');
  kitchenContainer.innerHTML = kitchenOrders.length ? kitchenOrders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${buildItemsList(order.items)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-status="preparing" data-order="${order.id}" type="button">Mark Preparing</button>
        <button class="btn btn-primary" data-status="ready" data-order="${order.id}" type="button">Mark Ready</button>
      </div>
    </div>
  `).join('') : '<p>No kitchen orders.</p>';

  const readyContainer = document.getElementById('readyOrders');
  readyContainer.innerHTML = readyOrders.length ? readyOrders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${buildItemsList(order.items)}</p>
      <button class="btn btn-dark" data-status="delivered" data-order="${order.id}" type="button">Mark Delivered</button>
    </div>
  `).join('') : '<p>No ready orders.</p>';

  document.querySelectorAll('button[data-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/orders/${button.dataset.order}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: button.dataset.status }),
        }, true);
        await loadOrders();
        await loadAnalytics();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  renderAnalytics(latestOrders);
}

async function loadInvoices() {
  if (!ensureRestaurantId()) return;
  try {
    const data = await apiRequest(`/api/invoices/restaurant/${restaurantId}`, {}, true);
    const invoices = data.invoices || [];
    const container = document.getElementById('invoiceList');
    if (!invoices.length) {
      container.innerHTML = '<p>No invoices synced yet.</p>';
      return;
    }

    container.innerHTML = invoices.map((inv) => `
      <div class="card">
        <strong>Order #${inv.order_id} | Table ${inv.table_number}</strong>
        <p>${inv.customer_name || 'Guest'} • ${String(inv.payment_status || '').toUpperCase()} • ₹${formatCurrency(inv.total_amount)}</p>
        <p>Synced: ${new Date(inv.synced_at).toLocaleString()}</p>
        <div class="toolbar">
          <button class="btn btn-light" data-view-invoice="${inv.id}" type="button">View JSON</button>
          <button class="btn btn-light" data-print-invoice="${inv.order_id}" type="button">Print Invoice</button>
          <a class="btn btn-dark" href="#" data-download="${inv.id}">Download JSON</a>
        </div>
        <pre id="invoice-json-${inv.id}" class="hidden" style="white-space:pre-wrap;max-height:260px;overflow:auto;margin-top:8px;">${escapeHtml(JSON.stringify(inv.invoice_payload || inv, null, 2))}</pre>
      </div>
    `).join('');

    container.querySelectorAll('button[data-view-invoice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.viewInvoice;
        const el = document.getElementById(`invoice-json-${id}`);
        if (!el) return;
        el.classList.toggle('hidden');
      });
    });

    container.querySelectorAll('a[data-download]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.dataset.download;
        const pre = document.getElementById(`invoice-json-${id}`);
        if (!pre) return;
        const blob = new Blob([pre.textContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${id}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
    });

    container.querySelectorAll('button[data-print-invoice]').forEach((button) => {
      button.addEventListener('click', () => {
        fetchAuthorizedHtml(`/orders/${button.dataset.printInvoice}/invoice?format=html`)
          .then((html) => {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
              throw new Error('Popup blocked');
            }
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
          })
          .catch((error) => {
            setMessage('ownerMessage', error.message, true);
          });
      });
    });
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
}

function initSocket() {
  if (!ensureRestaurantId()) return;
  const socket = io(window.APP_CONFIG.SOCKET_URL, { transports: ['websocket', 'polling'] });
  socket.emit('restaurant:join', restaurantId);

  socket.on('order:update', (payload) => {
    // reload orders and analytics when an order changes
    loadOrders().catch((error) => setMessage('ownerMessage', error.message, true));
    loadAnalytics().catch(() => {});

    // play notification sound for new orders
    try {
      if (payload && payload.type === 'created') {
        loadTables().catch(() => {});
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = 880;
          g.gain.value = 0.05;
          o.connect(g);
          g.connect(ctx.destination);
          o.start();
          setTimeout(() => { o.stop(); ctx.close().catch(() => {}); }, 120);
        } catch (e) {}
      }
    } catch (e) {}
  });

  socket.on('table:update', () => {
    loadTables().catch((error) => setMessage('ownerMessage', error.message, true));
  });

  socket.on('invoice:created', () => {
    loadInvoices().catch(() => {});
  });
}

async function initOwner() {
  if (!mustOwnerAuth()) return;

  hideBillModal();

  try {
    await loadRestaurant();
    await Promise.all([
      loadMenu(),
      loadTables(),
      loadInvoices(),
    ]);
    await loadOrders();
    setActiveSection('tables');
    initSocket();
    // apply theme preference
    try {
      const theme = localStorage.getItem('owner_theme') || 'light';
      if (theme === 'dark') document.documentElement.classList.add('theme-dark');
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('theme-dark');
        localStorage.setItem('owner_theme', isDark ? 'dark' : 'light');
        btn.textContent = isDark ? 'Light' : 'Dark';
      });
    } catch (e) {}
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
}

document.querySelectorAll('[data-owner-section]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await activateSection(button.dataset.ownerSection);
    } catch (error) {
      setMessage('ownerMessage', error.message, true);
    }
  });
});

document.getElementById('menuForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureRestaurantId()) return;
  const formData = new FormData(event.target);

  try {
    const payload = {
      restaurantId,
      name: formData.get('name'),
      price: Number(formData.get('price')),
      category: formData.get('category'),
      imageUrl: formData.get('imageUrl'),
      description: formData.get('description'),
      isAvailable: true,
    };

    await apiRequest('/menu', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, true);

    event.target.reset();
    await loadMenu();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('menuEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    const itemId = formData.get('itemId');
    await apiRequest(`/menu/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: formData.get('name'),
        price: Number(formData.get('price')),
        category: formData.get('category'),
        imageUrl: formData.get('imageUrl'),
        description: formData.get('description'),
      }),
    }, true);

    event.target.reset();
    event.target.classList.add('hidden');
    await loadMenu();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('tableForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureRestaurantId()) return;
  const formData = new FormData(event.target);

  try {
    await apiRequest(`/restaurants/${restaurantId}/tables`, {
      method: 'POST',
      body: JSON.stringify({ tableNumber: formData.get('tableNumber') }),
    }, true);

    event.target.reset();
    await loadTables();
    await loadAnalytics();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('autoTableForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureRestaurantId()) return;
  const formData = new FormData(event.target);

  try {
    const totalTables = Number(formData.get('totalTables'));
    const data = await apiRequest(`/restaurants/${restaurantId}/generate-qrs`, {
      method: 'POST',
      body: JSON.stringify({ tableCount: totalTables }),
    }, true);

    setMessage('ownerMessage', `Generated ${data.generatedCount} QR codes and updated the table boxes.`);
    await loadTables();
    await loadAnalytics();
    await activateSection('tables');
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureRestaurantId()) return;
  const formData = new FormData(event.target);
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (newPassword !== confirmPassword) {
    setMessage('ownerMessage', 'New password and confirmation do not match.', true);
    return;
  }

  try {
    const data = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }, true);

    event.target.reset();
    setMessage('ownerMessage', data.message || 'Password updated successfully.');
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearAuth();
  window.location.href = './auth.html';
});

document.getElementById('refreshInvoicesBtn').addEventListener('click', async () => {
  await loadInvoices();
});

const paymentSettingsForm = document.getElementById('paymentSettingsForm');
const editPaymentDetailsBtn = document.getElementById('editPaymentDetailsBtn');
const paymentAuthForm = document.getElementById('paymentAuthForm');
const cancelPaymentAuthBtn = document.getElementById('cancelPaymentAuthBtn');

if (editPaymentDetailsBtn) {
  editPaymentDetailsBtn.addEventListener('click', () => {
    openPaymentAuthModal();
  });
}

if (cancelPaymentAuthBtn) {
  cancelPaymentAuthBtn.addEventListener('click', () => {
    closePaymentAuthModal();
    paymentAuthForm?.reset();
  });
}

if (paymentAuthForm) {
  paymentAuthForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = String(new FormData(paymentAuthForm).get('dashboardPassword') || '').trim();

    if (!password) {
      setMessage('ownerMessage', 'Please enter your dashboard password.', true);
      return;
    }

    try {
      await apiRequest('/api/auth/verify-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password }),
      }, true);

      setPaymentSettingsEditable(true);
      closePaymentAuthModal();
      paymentAuthForm.reset();
      setMessage('ownerMessage', 'Verified. You can now update payment details.');
    } catch (error) {
      setMessage('ownerMessage', error.message, true);
    }
  });
}

if (paymentSettingsForm) {
  paymentSettingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(paymentSettingsForm);
    try {
      await apiRequest('/restaurants/owner/payment-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          upiVpa: fd.get('upiVpa'),
          bankAccountName: fd.get('bankAccountName'),
          bankName: fd.get('bankName'),
        }),
      }, true);
      await loadRestaurant();
      setMessage('ownerMessage', 'Payment details saved for UPI checkout.');
    } catch (error) {
      setMessage('ownerMessage', error.message, true);
    }
  });
}

function initBillModalEvents() {
  const modal = document.getElementById('billModal');
  const sheet = modal?.querySelector('.bill-modal__sheet');
  const closeBtn = document.getElementById('billModalClose');

  closeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideBillModal();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) hideBillModal();
  });

  sheet?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) {
      hideBillModal();
    }
  });
}

initBillModalEvents();

document.getElementById('billAddItemForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeBillOrder || !activeBillTableId) {
    setMessage('ownerMessage', 'Open a running bill from an orange table first.', true);
    return;
  }
  const select = document.getElementById('billMenuSelect');
  const option = select.options[select.selectedIndex];
  const menuItemId = Number(select.value);
  const qty = Number(document.getElementById('billAddQty').value || 1);
  if (!menuItemId) {
    setMessage('ownerMessage', 'Select a menu item to add.', true);
    return;
  }

  try {
    await apiRequest(`/orders/${activeBillOrder.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          menuItemId,
          itemPrice: Number(option.dataset.price),
          quantity: qty,
        }],
      }),
    }, true);
    setMessage('ownerMessage', 'Item added to running bill.');
    await openBillModalForTable(activeBillTableId);
    await loadTables();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('billConfirmCounterPaid')?.addEventListener('click', async () => {
  try {
    await markBillPaid('cash');
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('billTerminalReset')?.addEventListener('click', async () => {
  if (!activeBillTableId) return;
  try {
    await apiRequest(`/restaurants/${restaurantId}/tables/${activeBillTableId}/terminal-reset`, { method: 'POST' }, true);
    setMessage('ownerMessage', 'Table cleared for the next guest.');
    hideBillModal();
    await loadTables();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('billPrintInvoice')?.addEventListener('click', async () => {
  if (!activeBillOrder) return;
  try {
    const html = await fetchAuthorizedHtml(`/orders/${activeBillOrder.id}/invoice?format=html`);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

initOwner();
