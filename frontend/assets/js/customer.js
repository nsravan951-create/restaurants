const menuContainer = document.getElementById('menuContainer');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const codBtn = document.getElementById('codBtn');
const onlineBtn = document.getElementById('onlineBtn');
const tableLockNotice = document.getElementById('tableLockNotice');
const sessionTimerEl = document.getElementById('sessionTimer');
const joinSessionBtn = document.getElementById('joinSessionBtn');
const offersSection = document.getElementById('offersSection');
const offersContainer = document.getElementById('offersContainer');
const orderFoodBtn = document.getElementById('orderFoodBtn');
const postOrderModal = document.getElementById('postOrderModal');
const postOrderTotal = document.getElementById('postOrderTotal');
const postOrderActions = document.getElementById('postOrderActions');
const checkoutActions = document.getElementById('checkoutActions');
const orderMoreBtn = document.getElementById('orderMoreBtn');
const completeBookingBtn = document.getElementById('completeBookingBtn');
const modalCodBtn = document.getElementById('modalCodBtn');
const modalOnlineBtn = document.getElementById('modalOnlineBtn');

const cart = new Map();
let activeOfferId = null;
let context = null;
let routeState = null;
let activeSession = null;
let countdownInterval = null;
let pingInterval = null;
let currentBillOrderId = null;
let currentBillTotal = 0;

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
      const data = await apiRequest(`/api/table-sessions/${activeSession.id}/ping`, {
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
    const data = await apiRequest('/api/table-sessions/start', {
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
      qrToken: new URLSearchParams(window.location.search).get('token') || '',
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    restaurantId: Number(params.get('restaurantId')),
    tableId: Number(params.get('tableId')),
    tableNumber: params.get('table') || params.get('tableNumber') || null,
    qrToken: params.get('token') || '',
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
        <strong>${escapeHtml(item.name)}</strong>
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

function renderMenu(menu, ads = []) {
  const menuHTML = [];
  
  menu.forEach((item, index) => {
    // Add menu item
    menuHTML.push(`
      <article class="card menu-item-card">
        ${safeResourceUrl(item.image_url) ? `<img src="${escapeHtml(safeResourceUrl(item.image_url))}" alt="${escapeHtml(item.name)}" />` : ''}
        <div class="card-content">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="category">${escapeHtml(item.category)}</p>
          <p class="price">INR ${formatCurrency(item.price)}</p>
          <button class="btn btn-primary" data-id="${item.id}">Add to Cart</button>
        </div>
      </article>
    `);
    
    // Show an ad after every 3 menu items
    if (ads.length > 0 && (index + 1) % 3 === 0) {
      const adIndex = Math.floor((index + 1) / 3) - 1;
      if (adIndex < ads.length) {
        const ad = ads[adIndex];
        const mediaUrl = safeResourceUrl(ad.media_type === 'video' ? ad.video_url : ad.image_url);
        const offerUrl = safeResourceUrl(ad.target_link);
        const mediaHTML = ad.media_type === 'video' && mediaUrl
          ? `<video src="${escapeHtml(mediaUrl)}" muted loop playsinline autoplay></video>`
          : (mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(ad.title)}" />` : '');
        menuHTML.push(`
          <article class="card ad-card" data-ad-id="${ad.id}">
            ${mediaHTML}
            <div class="card-content">
              <h3>${escapeHtml(ad.title)}</h3>
              <p>${escapeHtml(ad.description || 'Exclusive offer from our partners')}</p>
              ${offerUrl ? `<a href="${escapeHtml(offerUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">View Offer</a>` : ''}
            </div>
          </article>
        `);
      }
    }
  });
  
  menuContainer.innerHTML = menuHTML.join('');

  menuContainer.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const menuItem = menu.find((m) => Number(m.id) === Number(button.dataset.id));
      if (menuItem) addToCart(menuItem);
    });
  });

  // Track ad clicks
  menuContainer.querySelectorAll('.ad-image').forEach((img) => {
    img.addEventListener('click', async (e) => {
      const adCard = e.target.closest('.ad-card');
      if (adCard) {
        const adId = adCard.dataset.adId;
        try {
          await apiRequest(`/api/ads/click/${adId}`, { method: 'POST' });
        } catch (error) {
          console.error('Failed to track ad click:', error.message);
        }
      }
    });
  });
}

function renderOffers(offers = []) {
  if (!offersSection || !offersContainer) return;
  if (!offers.length) {
    offersSection.classList.add('hidden');
    offersContainer.innerHTML = '';
    return;
  }
  offersSection.classList.remove('hidden');
  offersContainer.innerHTML = offers.map((offer) => {
    const items = (offer.items || []).map((item) => `${item.quantity} ${escapeHtml(item.name)}`).join(' + ');
    const saving = Math.max(0, Number(offer.original_price) - Number(offer.offer_price));
    const image = safeResourceUrl(offer.image_url);
    return `
      <article class="offer-card">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(offer.title)}" />` : '<div class="offer-card__placeholder" aria-hidden="true">%</div>'}
        <div class="offer-card__body">
          <span class="offer-card__badge">${saving > 0 ? `Save INR ${formatCurrency(saving)}` : 'Special price'}</span>
          <h3>${escapeHtml(offer.title)}</h3>
          <p>${items || escapeHtml(offer.description || 'Limited-time restaurant offer')}</p>
          <p class="offer-card__price">
            ${Number(offer.original_price) > Number(offer.offer_price) ? `<del>INR ${formatCurrency(offer.original_price)}</del>` : ''}
            <strong>INR ${formatCurrency(offer.offer_price)}</strong>
          </p>
          <button class="btn btn-primary" type="button" data-offer-id="${offer.id}">Add Combo</button>
        </div>
      </article>
    `;
  }).join('');
  offersContainer.querySelectorAll('[data-offer-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const offer = offers.find((item) => Number(item.id) === Number(button.dataset.offerId));
      if (offer) addOfferToCart(offer);
    });
  });
}

function addOfferToCart(offer) {
  const items = offer.items || [];
  if (!items.length) {
    setMessage('orderMessage', 'This offer has no available items.', true);
    return;
  }
  activeOfferId = Number(offer.id);
  items.forEach((item) => {
    const key = Number(item.menu_item_id);
    const existing = cart.get(key);
    if (existing) {
      existing.quantity = Math.max(existing.quantity, Number(item.quantity));
    } else {
      cart.set(key, {
        id: key,
        name: item.name,
        price: Number(item.price),
        lockedPrice: Number(item.price),
        quantity: Number(item.quantity),
      });
    }
  });
  renderCart();
  setMessage('orderMessage', `${offer.title} added to your cart.`);
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
    offerId: activeOfferId,
    items: entries.map((item) => ({
      menuItemId: item.id,
      itemPrice: item.lockedPrice,
      quantity: item.quantity,
    })),
  };

  const data = await apiRequest('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return data;
}

async function handleCod() {
  try {
    if (!currentBillOrderId) throw new Error('No active table bill found.');
    const data = await apiRequest(`/api/orders/${currentBillOrderId}/pay-cash`, {
      method: 'POST',
      body: JSON.stringify({ sessionToken: activeSession.sessionToken }),
    });
    const successUrl = new URL('../payment-success.html', window.location.href);
    successUrl.searchParams.set('orderId', String(data.orderId));
    successUrl.searchParams.set('sessionToken', activeSession.sessionToken);
    successUrl.searchParams.set('status', 'paid');
    successUrl.searchParams.set('tableId', String(context.table.id));
    if (routeState.qrToken) successUrl.searchParams.set('token', routeState.qrToken);
    window.location.assign(successUrl.toString());
  } catch (error) {
    setMessage('postOrderMessage', error.message, true);
  }
}

async function handleOnline() {
  try {
    if (!currentBillOrderId) throw new Error('No active table bill found.');
    const paymentData = await apiRequest('/api/payments/cashfree/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId: currentBillOrderId, sessionToken: activeSession.sessionToken }),
    });
    if (!paymentData.checkoutUrl) {
      throw new Error('Cashfree checkout is not ready. No payment was marked as successful.');
    }
    sessionStorage.setItem('autoresto_payment_success_context', JSON.stringify({
      orderId: paymentData.orderId,
      sessionToken: activeSession.sessionToken,
      status: 'pending',
      tableId: context.table.id,
      qrToken: routeState.qrToken || '',
    }));
    window.location.assign(paymentData.checkoutUrl);
  } catch (error) {
    setMessage('postOrderMessage', error.message, true);
  }
}

function showPostOrderModal(orderId, totalAmount) {
  currentBillOrderId = Number(orderId);
  currentBillTotal = Number(totalAmount || 0);
  postOrderTotal.textContent = `Current bill total: INR ${formatCurrency(currentBillTotal)}`;
  postOrderActions.classList.remove('hidden');
  checkoutActions.classList.add('hidden');
  postOrderModal.classList.remove('hidden');
  postOrderModal.classList.add('is-open');
  postOrderModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bill-modal-open');
}

function closePostOrderModal() {
  postOrderModal.classList.add('hidden');
  postOrderModal.classList.remove('is-open');
  postOrderModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bill-modal-open');
}

async function handleOrderFood() {
  try {
    const orderData = await placeOrder('cash');
    if (!orderData) return;
    cart.clear();
    activeOfferId = null;
    renderCart();
    showPostOrderModal(orderData.orderId, orderData.totalAmount);
  } catch (error) {
    setMessage('orderMessage', error.message, true);
  }
}


async function initCustomerPage() {
  try {
    routeState = parseRoute();
    if (!routeState.restaurantId) {
      setMessage('orderMessage', 'Invalid table QR URL', true);
      return;
    }

    if (!routeState.tableId && routeState.tableNumber) {
      const resolved = await apiRequest(`/api/restaurants/${routeState.restaurantId}/tables/resolve?table=${encodeURIComponent(routeState.tableNumber)}`);
      routeState.tableId = Number(resolved.table.id);
    }

    if (!routeState.tableId) {
      setMessage('orderMessage', 'Invalid table QR URL', true);
      return;
    }

    const data = await apiRequest(`/api/restaurants/${routeState.restaurantId}/table/${routeState.tableId}`);
    context = data;

    document.getElementById('restaurantTitle').textContent = data.restaurant.name;
    document.getElementById('tableInfo').textContent = `Table ${data.table.table_number}`;

    renderOffers(data.offers);
    renderMenu(data.menu, data.ads);
    renderCart();

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

orderFoodBtn?.addEventListener('click', handleOrderFood);
orderMoreBtn?.addEventListener('click', () => {
  closePostOrderModal();
  setOrderingLocked(false, 'Table session active. You can add more food to the same bill.');
});
completeBookingBtn?.addEventListener('click', () => {
  postOrderActions.classList.add('hidden');
  checkoutActions.classList.remove('hidden');
});
modalCodBtn?.addEventListener('click', handleCod);
modalOnlineBtn?.addEventListener('click', handleOnline);

initCustomerPage();
