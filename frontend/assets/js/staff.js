function parseOrderItems(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items;
    return parsed.map((item) => `${item.item_name} x${item.quantity}`).join(', ');
  } catch (error) {
    return 'Unable to parse items';
  }
}

function openInvoice(orderId) {
  const auth = getStaffAuth();
  if (!auth) return;
  const url = `./invoice.html?orderId=${encodeURIComponent(orderId)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getStaffAuth() {
  const auth = getAuth();
  if (!auth || !auth.token || auth.user.role !== 'staff' || !auth.restaurant) {
    setMessage('staffMessage', 'Login as staff user first', true);
    return null;
  }
  return auth;
}

async function loadStaffBoard() {
  const auth = getStaffAuth();
  if (!auth) return;

  const data = await apiRequest(`/orders/restaurant/${auth.restaurant.id}?status=ready`, {}, true);
  const board = document.getElementById('staffBoard');

  board.innerHTML = data.orders.map((order) => `
    <div class="card">
      <strong>Order #${order.id} | Table ${order.table_number}</strong>
      <p>${parseOrderItems(order.items)}</p>
      <div class="toolbar">
        <button class="btn btn-light" data-print="${order.id}">Print Bill</button>
        <button class="btn btn-dark" data-id="${order.id}">Mark Delivered</button>
      </div>
    </div>
  `).join('') || '<p>No ready orders.</p>';

  board.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/orders/${button.dataset.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'delivered' }),
        }, true);
        await loadStaffBoard();
      } catch (error) {
        setMessage('staffMessage', error.message, true);
      }
    });
  });

  board.querySelectorAll('button[data-print]').forEach((button) => {
    button.addEventListener('click', () => openInvoice(button.dataset.print));
  });
}

function initStaffSocket() {
  const auth = getStaffAuth();
  if (!auth) return;

  const socket = io(window.APP_CONFIG.SOCKET_URL);
  socket.emit('restaurant:join', auth.restaurant.id);
  socket.on('order:update', () => {
    loadStaffBoard().catch((error) => setMessage('staffMessage', error.message, true));
  });
}

loadStaffBoard().catch((error) => setMessage('staffMessage', error.message, true));
initStaffSocket();
