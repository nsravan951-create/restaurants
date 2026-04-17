function parseOrderItems(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items;
    return parsed.map((item) => `${item.item_name} x${item.quantity}`).join(', ');
  } catch (error) {
    return 'Unable to parse items';
  }
}

function openInvoice(orderId) {
  const auth = getKitchenAuth();
  if (!auth) return;
  const url = `./invoice.html?orderId=${encodeURIComponent(orderId)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getKitchenAuth() {
  const auth = getAuth();
  if (!auth || !auth.token || auth.user.role !== 'kitchen' || !auth.restaurant) {
    setMessage('kitchenMessage', 'Login as kitchen user first', true);
    return null;
  }
  return auth;
}

async function loadKitchenBoard() {
  const auth = getKitchenAuth();
  if (!auth) return;

  const data = await apiRequest(`/orders/restaurant/${auth.restaurant.id}`, {}, true);
  const board = document.getElementById('kitchenBoard');
  const kitchenOrders = data.orders.filter((order) => order.status === 'pending' || order.status === 'preparing');

  board.innerHTML = kitchenOrders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${parseOrderItems(order.items)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-print="${order.id}">Print Bill</button>
        <button class="btn btn-light" data-id="${order.id}" data-status="preparing">Mark Preparing</button>
        <button class="btn btn-primary" data-id="${order.id}" data-status="ready">Mark Ready</button>
      </div>
    </div>
  `).join('') || '<p>No kitchen orders.</p>';

  board.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/orders/${button.dataset.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: button.dataset.status }),
        }, true);
        await loadKitchenBoard();
      } catch (error) {
        setMessage('kitchenMessage', error.message, true);
      }
    });
  });

  board.querySelectorAll('button[data-print]').forEach((button) => {
    button.addEventListener('click', () => openInvoice(button.dataset.print));
  });
}

function initKitchenSocket() {
  const auth = getKitchenAuth();
  if (!auth) return;

  const socket = io(window.APP_CONFIG.SOCKET_URL);
  socket.emit('restaurant:join', auth.restaurant.id);
  socket.on('order:update', () => {
    loadKitchenBoard().catch((error) => setMessage('kitchenMessage', error.message, true));
  });
}

loadKitchenBoard().catch((error) => setMessage('kitchenMessage', error.message, true));
initKitchenSocket();
