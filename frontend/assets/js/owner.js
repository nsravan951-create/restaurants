let restaurantId = null;

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

function buildItemsList(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items;
    return parsed.map((item) => `${item.item_name} x${item.quantity}`).join(', ');
  } catch (error) {
    return 'Unable to parse order items';
  }
}

async function loadRestaurant() {
  const data = await apiRequest('/restaurants/owner/me', {}, true);
  restaurantId = data.restaurant.id;
  document.getElementById('ownerRestaurantName').textContent = `${data.restaurant.name} Dashboard`;
}

async function loadMenu() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/menu/${restaurantId}`, {}, true);
  const menuList = document.getElementById('menuList');

  menuList.innerHTML = data.menu.map((item) => `
    <div class="card">
      <strong>${item.name}</strong>
      <p>${item.category} | INR ${formatCurrency(item.price)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-edit-item="${encodeURIComponent(JSON.stringify(item))}">Edit</button>
        <button class="btn btn-light" data-delete="${item.id}">Delete</button>
      </div>
    </div>
  `).join('');

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

  tableList.innerHTML = data.tables.map((table) => `
    <div class="card">
      <strong>Table ${table.table_number}</strong>
      <p>Status: ${table.availability_status}</p>
      ${table.qr_data_url ? `<img src="${table.qr_data_url}" alt="QR" style="max-width:160px;border-radius:10px;" />` : ''}
      <div class="toolbar">
        <a class="btn btn-light" href="${table.qr_data_url || '#'}" download="table-${table.table_number}.png">Download QR</a>
        <button class="btn btn-light" data-print-qr="${table.id}">Print QR</button>
        <button class="btn btn-dark" data-delete-table="${table.id}">Delete</button>
      </div>
      <div id="qr-${table.id}" style="word-break:break-all">${table.qr_url || ''}</div>
    </div>
  `).join('');

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
}

async function loadOrders() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/orders/restaurant/${restaurantId}`, {}, true);
  const kitchenOrders = data.orders.filter((order) => order.status === 'pending' || order.status === 'preparing');
  const readyOrders = data.orders.filter((order) => order.status === 'ready');

  document.getElementById('kitchenOrders').innerHTML = kitchenOrders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${buildItemsList(order.items)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-status="preparing" data-order="${order.id}">Mark Preparing</button>
        <button class="btn btn-primary" data-status="ready" data-order="${order.id}">Mark Ready</button>
      </div>
    </div>
  `).join('') || '<p>No kitchen orders.</p>';

  document.getElementById('readyOrders').innerHTML = readyOrders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${buildItemsList(order.items)}</p>
      <button class="btn btn-dark" data-status="delivered" data-order="${order.id}">Mark Delivered</button>
    </div>
  `).join('') || '<p>No ready orders.</p>';

  document.querySelectorAll('button[data-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/orders/${button.dataset.order}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: button.dataset.status }),
        }, true);
        await loadOrders();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });
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
        <p>${inv.customer_name || 'Guest'} • ${inv.payment_status.toUpperCase()} • ₹${formatCurrency(inv.total_amount)}</p>
        <p>Synced: ${new Date(inv.synced_at).toLocaleString()}</p>
        <div class="toolbar">
          <button class="btn btn-light" data-view-invoice="${inv.id}">View JSON</button>
          <a class="btn btn-dark" href="#" data-download="${inv.id}">Download JSON</a>
        </div>
        <pre id="invoice-json-${inv.id}" class="hidden" style="white-space:pre-wrap;max-height:260px;overflow:auto;margin-top:8px;">${escapeHtml(JSON.stringify(inv.invoice_payload || inv, null, 2))}</pre>
      </div>
    `).join('');

    container.querySelectorAll('button[data-view-invoice]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
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
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initSocket() {
  if (!ensureRestaurantId()) return;
  const socket = io(window.APP_CONFIG.SOCKET_URL);
  socket.emit('restaurant:join', restaurantId);
  socket.on('order:update', () => {
    loadOrders().catch((error) => setMessage('ownerMessage', error.message, true));
  });
}

async function initOwner() {
  if (!mustOwnerAuth()) return;

  try {
    await loadRestaurant();
    await loadMenu();
    await loadTables();
    await loadOrders();
    await loadInvoices();
    initSocket();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
}

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

    setMessage('ownerMessage', `Generated ${data.generatedCount} QR codes.`);
    await loadTables();
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

initOwner();
