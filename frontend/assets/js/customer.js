const menuContainer = document.getElementById('menuContainer');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const codBtn = document.getElementById('codBtn');
const onlineBtn = document.getElementById('onlineBtn');
const tableLockNotice = document.getElementById('tableLockNotice');
const sessionTimerEl = document.getElementById('sessionTimer');
const joinSessionBtn = document.getElementById('joinSessionBtn');

const cart = new Map();
let context = null;
let routeState = null;
let activeSession = null;
let countdownInterval = null;
let pingInterval = null;

const CLIENT_ID_KEY = 'qr_customer_client_id';
const SESSION_KEY_PREFIX = 'qr_table_session_';

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `cli_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function getSessionKey(restaurantId, tableId) {
  return `${SESSION_KEY_PREFIX}${restaurantId}_${tableId}`;
}

function loadStoredSession(restaurantId, tableId) {
  const raw = localStorage.getItem(getSessionKey(restaurantId, tableId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveStoredSession(restaurantId, tableId, session) {
  localStorage.setItem(getSessionKey(restaurantId, tableId), JSON.stringify(session));
}

function clearStoredSession(restaurantId, tableId) {
  localStorage.removeItem(getSessionKey(restaurantId, tableId));
}

function setOrderingLocked(locked, message = '') {
  codBtn.disabled = locked;
  onlineBtn.disabled = locked;
  menuContainer.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.disabled = locked;
  });

  tableLockNotice.textContent = message;
  tableLockNotice.className = locked ? 'message lock-warning' : 'message';
}

function startCountdown(expiresAt) {
  if (countdownInterval) clearInterval(countdownInterval);

  const render = () => {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      sessionTimerEl.textContent = 'Table session expired. Please start or join again.';
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }

    const totalSec = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    sessionTimerEl.textContent = `Session timer: ${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  render();
  countdownInterval = setInterval(render, 1000);
}

function startSessionPing() {
  if (pingInterval) clearInterval(pingInterval);
  if (!activeSession) return;

  pingInterval = setInterval(async () => {
    try {
      const data = await apiRequest(`/table-sessions/${activeSession.id}/ping`, {
        method: 'POST',
        body: JSON.stringify({ sessionToken: activeSession.sessionToken }),
      });

      activeSession.expiresAt = data.expiresAt;
      saveStoredSession(routeState.restaurantId, routeState.tableId, activeSession);
      startCountdown(activeSession.expiresAt);
    } catch (error) {
      setOrderingLocked(true, error.message || 'Table session expired');
      joinSessionBtn.classList.remove('hidden');
      clearStoredSession(routeState.restaurantId, routeState.tableId);
      activeSession = null;
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    }
  }, 60000);
}

async function startOrJoinSession(joinExisting = false) {
  const stored = loadStoredSession(routeState.restaurantId, routeState.tableId);

  try {
    const data = await apiRequest('/table-sessions/start', {
      method: 'POST',
      body: JSON.stringify({
        restaurantId: routeState.restaurantId,
        tableId: routeState.tableId,
        clientId: getClientId(),
        joinExisting,
        sessionToken: stored?.sessionToken || '',
      }),
    });

    activeSession = data.session;
    saveStoredSession(routeState.restaurantId, routeState.tableId, activeSession);
    setOrderingLocked(false, 'Table session active. You can place your order.');
    joinSessionBtn.classList.add('hidden');
    startCountdown(activeSession.expiresAt);
    startSessionPing();
  } catch (error) {
    const isLocked = error.status === 409 && error.data && error.data.locked;
    if (isLocked) {
      setOrderingLocked(true, error.message);
      joinSessionBtn.classList.remove('hidden');
      if (error.data.session?.expiresAt) {
        startCountdown(error.data.session.expiresAt);
      }
      return;
    }

    setOrderingLocked(true, error.message || 'Unable to start table session');
  }
}

function parseRoute() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const restaurantIdx = parts.indexOf('restaurant');
  const tableIdx = parts.indexOf('table');

  if (restaurantIdx !== -1 && tableIdx !== -1) {
    return {
      restaurantId: Number(parts[restaurantIdx + 1]),
      tableId: Number(parts[tableIdx + 1]),
      tableNumber: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    restaurantId: Number(params.get('restaurantId')),
    tableId: Number(params.get('tableId')),
    tableNumber: params.get('table') || params.get('tableNumber') || null,
  };
}

function renderCart() {
  const entries = Array.from(cart.values());
  if (!entries.length) {
    cartItemsEl.innerHTML = '<p>Your cart is empty.</p>';
    cartTotalEl.textContent = '0.00';
    return;
  }

  let total = 0;
  cartItemsEl.innerHTML = entries.map((item) => {
    const lineTotal = item.price * item.quantity;
    total += lineTotal;
    return `
      <div class="card">
        <strong>${item.name}</strong>
        <p>Qty: ${item.quantity}</p>
        <p>INR ${formatCurrency(lineTotal)}</p>
      </div>
    `;
  }).join('');

  cartTotalEl.textContent = formatCurrency(total);
}

function addToCart(item) {
  const existing = cart.get(item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.set(item.id, {
      id: item.id,
      name: item.name,
      price: Number(item.price),
      lockedPrice: Number(item.price),
      quantity: 1,
    });
  }
  renderCart();
}

function renderMenu(menu) {
  menuContainer.innerHTML = menu.map((item) => `
    <article class="card">
      ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width:100%;height:140px;object-fit:cover;border-radius:10px;" />` : ''}
      <h3>${item.name}</h3>
      <p>${item.category}</p>
      <p>INR ${formatCurrency(item.price)}</p>
      <button class="btn btn-primary" data-id="${item.id}">Add to Cart</button>
    </article>
  `).join('');

  menuContainer.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const menuItem = menu.find((m) => Number(m.id) === Number(button.dataset.id));
      if (menuItem) addToCart(menuItem);
    });
  });
}

async function placeOrder(paymentMethod) {
  if (!activeSession) {
    throw new Error('Table session is not active. Please start or join the session first.');
  }

  const entries = Array.from(cart.values());
  if (!entries.length) {
    setMessage('orderMessage', 'Add at least one item to cart', true);
    return null;
  }

  const payload = {
    restaurantId: context.restaurant.id,
    tableId: context.table.id,
    tableSessionId: activeSession.id,
    sessionToken: activeSession.sessionToken,
    customerName: document.getElementById('customerName').value.trim(),
    notes: document.getElementById('orderNotes').value.trim(),
    paymentMethod,
    items: entries.map((item) => ({
      menuItemId: item.id,
      itemPrice: item.lockedPrice,
      quantity: item.quantity,
    })),
  };

  const data = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return data;
}

async function handleCod() {
  try {
    const orderData = await placeOrder('cod');
    setMessage('orderMessage', `Order #${orderData.orderId} placed successfully. Wait for staff delivery.`);
    setOrderingLocked(true, 'Order already placed for this active table session.');
    cart.clear();
    renderCart();
  } catch (error) {
    setMessage('orderMessage', error.message, true);
  }
}

async function handleOnline() {
  try {
    const orderData = await placeOrder('online');
    const paymentData = await apiRequest('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderData.orderId }),
    });

    const options = {
      key: paymentData.keyId,
      amount: paymentData.razorpayOrder.amount,
      currency: 'INR',
      name: context.restaurant.name,
      description: `Table ${context.table.table_number} Order`,
      order_id: paymentData.razorpayOrder.id,
      handler: async function (response) {
        try {
          await apiRequest('/payments/verify', {
            method: 'POST',
            body: JSON.stringify({
              orderId: orderData.orderId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          setMessage('orderMessage', `Payment successful and order #${orderData.orderId} confirmed`);
          clearStoredSession(routeState.restaurantId, routeState.tableId);
          activeSession = null;
          setOrderingLocked(true, 'Payment completed. Table session ended.');
          sessionTimerEl.textContent = 'Table is now available for a new session.';
          cart.clear();
          renderCart();
        } catch (error) {
          setMessage('orderMessage', error.message, true);
        }
      },
      theme: { color: '#e66a3d' },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    setMessage('orderMessage', error.message, true);
  }
}

function setupAdPopup(ads) {
  if (!ads || !ads.length) return;

  const ad = ads[Math.floor(Math.random() * ads.length)];
  const popup = document.getElementById('adPopup');
  const adImage = document.getElementById('adImage');
  const adTitle = document.getElementById('adTitle');
  const adLink = document.getElementById('adLink');

  const showInMs = 60000 + Math.floor(Math.random() * 60000);

  setTimeout(() => {
    adImage.src = ad.image_url;
    adTitle.textContent = ad.title;
    adLink.href = ad.target_link;
    popup.classList.remove('hidden');
  }, showInMs);

  adLink.addEventListener('click', async () => {
    try {
      await apiRequest(`/ads/click/${ad.id}`, { method: 'POST' });
    } catch (error) {
      console.error(error.message);
    }
  });

  document.getElementById('closeAd').addEventListener('click', () => {
    popup.classList.add('hidden');
  });
}

async function initCustomerPage() {
  try {
    routeState = parseRoute();
    if (!routeState.restaurantId) {
      setMessage('orderMessage', 'Invalid table QR URL', true);
      return;
    }

    if (!routeState.tableId && routeState.tableNumber) {
      const resolved = await apiRequest(`/restaurants/${routeState.restaurantId}/tables/resolve?table=${encodeURIComponent(routeState.tableNumber)}`);
      routeState.tableId = Number(resolved.table.id);
    }

    if (!routeState.tableId) {
      setMessage('orderMessage', 'Invalid table QR URL', true);
      return;
    }

    const data = await apiRequest(`/restaurants/${routeState.restaurantId}/table/${routeState.tableId}`);
    context = data;

    document.getElementById('restaurantTitle').textContent = data.restaurant.name;
    document.getElementById('tableInfo').textContent = `Table ${data.table.table_number}`;

    renderMenu(data.menu);
    renderCart();
    setupAdPopup(data.ads);
    await startOrJoinSession(false);
  } catch (error) {
    setMessage('orderMessage', error.message, true);
  }
}

if (joinSessionBtn) {
  joinSessionBtn.addEventListener('click', async () => {
    await startOrJoinSession(true);
  });
}

if (codBtn) {
  codBtn.addEventListener('click', handleCod);
}

if (onlineBtn) {
  onlineBtn.addEventListener('click', handleOnline);
}

initCustomerPage();
