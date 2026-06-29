(function () {
  const state = {
    dashboard: null,
    query: '',
    editingAdId: null,
    activeSection: 'overview',
    messages: [],
    selectedRestaurants: new Set(),
    operations: null,
  };

  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

  const el = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString();
  }

  function formatDateShort(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function setSection(section) {
    state.activeSection = section;
    document.querySelectorAll('.admin-section').forEach((node) => node.classList.add('hidden'));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.admin-link[data-section]').forEach((button) => {
      button.classList.toggle('active', button.dataset.section === section);
    });
  }

  function setMessage(message, isError = false) {
    const node = el('adminMessage');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#ffb4b4' : '#d8ffea';
  }

  function getDashboard() {
    return state.dashboard || { summary: {}, restaurants: [], ads: [], revenueSeries: [], topRestaurants: [] };
  }

  function getFilteredRestaurants() {
    const { restaurants } = getDashboard();
    const query = state.query.trim().toLowerCase();
    if (!query) return restaurants;

    return restaurants.filter((restaurant) => {
      const values = [
        restaurant.name,
        restaurant.owner_name,
        restaurant.owner_email,
        restaurant.phone,
        restaurant.address,
        restaurant.subscription_plan,
        restaurant.subscription_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return values.includes(query);
    });
  }

  function getFilteredAds() {
    const { ads } = getDashboard();
    const query = state.query.trim().toLowerCase();
    if (!query) return ads;

    return ads.filter((ad) => {
      const values = [ad.title, ad.restaurantName, ad.targetLink]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return values.includes(query);
    });
  }

  function renderSummary() {
    const summary = getDashboard().summary || {};
    const cards = [
      ['totalRestaurants', 'Total restaurants', summary.totalRestaurants || 0],
      ['activeRestaurants', 'Active restaurants', summary.activeRestaurants || 0],
      ['monthlyRevenue', 'Monthly revenue', formatMoney(summary.monthlyRevenue || 0)],
      ['todayRevenue', 'Today revenue', formatMoney(summary.todayRevenue || 0)],
      ['totalOrders', 'Total orders', summary.totalOrders || 0],
      ['activeOrders', 'Active orders', summary.activeOrders || 0],
      ['activeAds', 'Active ads', summary.activeAds || 0],
      ['totalClicks', 'Ad clicks', summary.totalClicks || 0],
    ];

    el('summaryCards').innerHTML = cards.map(([key, title, value]) => `
      <article class="metric-card" data-key="${key}">
        <span class="metric-card__label">${title}</span>
        <strong class="metric-card__value">${escapeHtml(value)}</strong>
      </article>
    `).join('');

    const note = el('sessionSummary');
    if (note) {
      note.textContent = `${summary.totalRestaurants || 0} restaurants, ${summary.totalAds || 0} ads, ${formatMoney(summary.totalRevenue || 0)} total revenue.`;
    }
  }

  function renderRevenueTrend() {
    const revenueSeries = getDashboard().revenueSeries || [];
    const maxRevenue = Math.max(...revenueSeries.map((row) => Number(row.revenue || 0)), 1);

    el('revenueTrend').innerHTML = revenueSeries.map((row) => {
      const revenue = Number(row.revenue || 0);
      const width = Math.max((revenue / maxRevenue) * 100, 4);
      return `
        <div class="trend-row">
          <div class="trend-row__meta">
            <span>${escapeHtml(formatDateShort(row.day))}</span>
            <strong>${escapeHtml(formatMoney(revenue))}</strong>
          </div>
          <div class="trend-bar"><span style="width:${width}%"></span></div>
        </div>
      `;
    }).join('') || '<p class="muted">No revenue data yet.</p>';
  }

  function renderTopRestaurants() {
    const restaurants = (getDashboard().topRestaurants || []).slice(0, 5);
    el('topRestaurants').innerHTML = restaurants.map((restaurant, index) => `
      <div class="rank-card">
        <div class="rank-card__index">${index + 1}</div>
        <div class="rank-card__body">
          <strong>${escapeHtml(restaurant.name)}</strong>
          <p>${escapeHtml(restaurant.owner_name || 'No owner')} • ${escapeHtml(restaurant.active_tables || 0)} active tables</p>
        </div>
        <div class="rank-card__value">${escapeHtml(formatMoney(restaurant.monthly_revenue || 0))}</div>
      </div>
    `).join('') || '<p class="muted">No restaurant analytics yet.</p>';
  }

  function renderAnalytics() {
    const summary = getDashboard().summary || {};
    const analyticsCards = [
      ['Total revenue', formatMoney(summary.totalRevenue || 0)],
      ['Monthly revenue', formatMoney(summary.monthlyRevenue || 0)],
      ['Today revenue', formatMoney(summary.todayRevenue || 0)],
      ['Ad impressions', summary.totalImpressions || 0],
      ['Ad clicks', summary.totalClicks || 0],
      ['CTR', summary.totalImpressions ? `${((Number(summary.totalClicks || 0) / Number(summary.totalImpressions || 1)) * 100).toFixed(2)}%` : '0%'],
    ];

    const cardsRoot = el('analyticsCards');
    if (cardsRoot) {
      cardsRoot.innerHTML = analyticsCards.map(([label, value]) => `
        <article class="metric-card metric-card--soft">
          <span class="metric-card__label">${escapeHtml(label)}</span>
          <strong class="metric-card__value">${escapeHtml(value)}</strong>
        </article>
      `).join('');
    }

    const restaurants = getFilteredRestaurants();
    const maxRevenue = Math.max(...restaurants.map((restaurant) => Number(restaurant.monthly_revenue || 0)), 1);

    el('analyticsList').innerHTML = restaurants.map((restaurant) => {
      const revenue = Number(restaurant.monthly_revenue || 0);
      const percent = Math.max((revenue / maxRevenue) * 100, 5);
      return `
        <article class="admin-item">
          <div class="admin-item__header">
            <div>
              <h4>${escapeHtml(restaurant.name)}</h4>
              <p>${escapeHtml(restaurant.owner_name || 'No owner')} • ${escapeHtml(restaurant.owner_email || 'No email')}</p>
            </div>
            <span class="badge ${restaurant.is_active ? 'badge--success' : 'badge--muted'}">${restaurant.is_active ? 'Active' : 'Disabled'}</span>
          </div>
          <div class="admin-item__metrics">
            <span>Monthly revenue: ${escapeHtml(formatMoney(restaurant.monthly_revenue || 0))}</span>
            <span>Orders: ${escapeHtml(restaurant.monthly_orders || 0)}</span>
            <span>Tables: ${escapeHtml(restaurant.total_tables || 0)} total / ${escapeHtml(restaurant.active_tables || 0)} active</span>
            <span>Ads: ${escapeHtml(restaurant.active_ads || 0)} active / ${escapeHtml(restaurant.total_ads || 0)} total</span>
          </div>
          <div class="trend-bar trend-bar--compact"><span style="width:${percent}%"></span></div>
        </article>
      `;
    }).join('') || '<p class="muted">No restaurants match your search.</p>';
  }

  function populateAdRestaurantOptions() {
    const select = el('adRestaurantSelect');
    if (!select) return;

    const restaurants = getDashboard().restaurants || [];
    const currentValue = select.value;
    select.innerHTML = '<option value="">Global ad</option>' + restaurants.map((restaurant) => `
      <option value="${restaurant.id}">${escapeHtml(restaurant.name)}</option>
    `).join('');

    if (currentValue) select.value = currentValue;
  }

  function resetAdForm() {
    state.editingAdId = null;
    const form = el('adForm');
    const submitButton = el('adSubmitButton');
    if (form) form.reset();
    if (form) form.querySelector('[name="adId"]').value = '';
    if (submitButton) submitButton.textContent = 'Create ad';
    if (form) form.querySelector('[name="isActive"]').checked = true;
  }

  function startAdEdit(ad) {
    state.editingAdId = ad.id;
    const form = el('adForm');
    const submitButton = el('adSubmitButton');
    if (!form || !submitButton) return;

    form.querySelector('[name="adId"]').value = ad.id;
    form.querySelector('[name="title"]').value = ad.title || '';
    form.querySelector('[name="imageUrl"]').value = ad.imageUrl || '';
    form.querySelector('[name="targetLink"]').value = ad.targetLink || '';
    form.querySelector('[name="restaurantId"]').value = ad.restaurantId || '';
    form.querySelector('[name="startsAt"]').value = ad.startsAt ? new Date(ad.startsAt).toISOString().slice(0, 16) : '';
    form.querySelector('[name="endsAt"]').value = ad.endsAt ? new Date(ad.endsAt).toISOString().slice(0, 16) : '';
    form.querySelector('[name="isActive"]').checked = Boolean(ad.isActive);
    submitButton.textContent = 'Update ad';
  }

  function renderRestaurantList() {
    const restaurants = getFilteredRestaurants();
    const root = el('restaurantList');

    root.innerHTML = restaurants.map((restaurant) => {
      const subscriptionStatus = restaurant.subscription_status || 'inactive';
      const subscriptionPlan = restaurant.subscription_plan || 'None';
      const expiresAt = restaurant.subscription_expires_at ? formatDate(restaurant.subscription_expires_at) : '—';
      const toggleLabel = restaurant.is_active ? 'Deactivate' : 'Activate';

      return `
        <article class="admin-item">
          <div class="admin-item__header">
            <div>
              <h4>${escapeHtml(restaurant.name)}</h4>
              <p>${escapeHtml(restaurant.owner_name || 'No owner')} • ${escapeHtml(restaurant.owner_email || 'No email')}</p>
            </div>
            <span class="badge ${restaurant.is_active ? 'badge--success' : 'badge--muted'}">${restaurant.is_active ? 'Active' : 'Disabled'}</span>
          </div>

          <div class="admin-item__metrics">
            <span>Total revenue: ${escapeHtml(formatMoney(restaurant.total_revenue || 0))}</span>
            <span>Monthly revenue: ${escapeHtml(formatMoney(restaurant.monthly_revenue || 0))}</span>
            <span>Tables: ${escapeHtml(restaurant.total_tables || 0)} total / ${escapeHtml(restaurant.active_tables || 0)} active</span>
            <span>Subscription: ${escapeHtml(subscriptionPlan)} • ${escapeHtml(subscriptionStatus)} • ${escapeHtml(expiresAt)}</span>
            <span>Ads: ${escapeHtml(restaurant.active_ads || 0)} active / ${escapeHtml(restaurant.total_ads || 0)} total</span>
          </div>

          <div class="admin-item__actions">
            <button class="btn btn-light" data-restaurant-toggle="${restaurant.id}">${toggleLabel}</button>
            <button class="btn btn-primary" data-restaurant-subscribe="${restaurant.id}" data-plan="Basic" data-months="1">Basic 1 mo</button>
            <button class="btn btn-dark" data-restaurant-subscribe="${restaurant.id}" data-plan="Premium" data-months="1">Premium 1 mo</button>
            <button class="btn btn-light" data-restaurant-unsubscribe="${restaurant.id}">Unsubscribe</button>
          </div>
        </article>
      `;
    }).join('') || '<p class="muted">No restaurants match your search.</p>';

    root.querySelectorAll('[data-restaurant-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/admin/restaurants/${button.dataset.restaurantToggle}/toggle`, { method: 'PATCH' }, true);
          await loadDashboard();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });

    root.querySelectorAll('[data-restaurant-subscribe]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/admin/restaurants/${button.dataset.restaurantSubscribe}/subscribe`, {
            method: 'POST',
            body: JSON.stringify({ plan: button.dataset.plan, months: Number(button.dataset.months || 1) }),
          }, true);
          await loadDashboard();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });

    root.querySelectorAll('[data-restaurant-unsubscribe]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/admin/restaurants/${button.dataset.restaurantUnsubscribe}/unsubscribe`, { method: 'POST' }, true);
          await loadDashboard();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });
  }

  function renderAdsList() {
    const ads = getFilteredAds();
    const root = el('adsList');

    root.innerHTML = ads.map((ad) => `
      <article class="admin-item">
        <div class="admin-item__header">
          <div>
            <h4>${escapeHtml(ad.title)}</h4>
            <p>${escapeHtml(ad.restaurantName || 'Global')} • ${escapeHtml(ad.targetLink)}</p>
          </div>
          <span class="badge ${ad.isActive ? 'badge--success' : 'badge--muted'}">${ad.isActive ? 'Active' : 'Paused'}</span>
        </div>
        <div class="admin-item__metrics">
          <span>Impressions: ${escapeHtml(ad.impressions || 0)}</span>
          <span>Clicks: ${escapeHtml(ad.clicks || 0)}</span>
          <span>CTR: ${escapeHtml(ad.ctr || 0)}%</span>
          <span>Starts: ${escapeHtml(formatDate(ad.startsAt))}</span>
          <span>Ends: ${escapeHtml(formatDate(ad.endsAt))}</span>
        </div>
        <div class="admin-item__actions">
          <button class="btn btn-light" data-ad-edit="${ad.id}">Edit</button>
          <button class="btn btn-primary" data-ad-toggle="${ad.id}">${ad.isActive ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-dark" data-ad-delete="${ad.id}">Delete</button>
        </div>
      </article>
    `).join('') || '<p class="muted">No ads match your search.</p>';

    root.querySelectorAll('[data-ad-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const ad = getDashboard().ads.find((item) => String(item.id) === String(button.dataset.adEdit));
        if (!ad) return;
        startAdEdit(ad);
        setSection('ads');
      });
    });

    root.querySelectorAll('[data-ad-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ad = getDashboard().ads.find((item) => String(item.id) === String(button.dataset.adToggle));
        if (!ad) return;

        try {
          await apiRequest(`/api/ads/${ad.id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: !ad.isActive }),
          }, true);
          await loadDashboard();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });

    root.querySelectorAll('[data-ad-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this ad?')) return;

        try {
          await apiRequest(`/api/ads/${button.dataset.adDelete}`, { method: 'DELETE' }, true);
          if (state.editingAdId && String(state.editingAdId) === String(button.dataset.adDelete)) {
            resetAdForm();
          }
          await loadDashboard();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });
  }

  function renderAll() {
    renderSummary();
    renderRevenueTrend();
    renderTopRestaurants();
    renderAnalytics();
    renderOperationsDashboard();
    populateAdRestaurantOptions();
    renderRestaurantList();
    renderAdsList();
    loadMessages();
  }

  async function loadDashboard() {
    setMessage('Loading dashboard...');
    const data = await apiRequest('/api/admin/dashboard', {}, true);
    state.dashboard = data;
    renderAll();
    setMessage('Dashboard ready.');
  }

  // ===== OPERATIONS DASHBOARD =====
  function renderOperationsDashboard() {
    const restaurants = getDashboard().restaurants || [];
    const orders = getDashboard().orders || [];

    // Calculate operations metrics
    const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length;
    const restaurantsOnline = restaurants.filter(r => r.is_active).length;
    const totalTableActivity = restaurants.reduce((sum, r) => sum + (r.active_tables || 0), 0);
    const averageOrderValue = restaurants.length > 0 
      ? restaurants.reduce((sum, r) => sum + (r.monthly_revenue || 0), 0) / orders.length || 0
      : 0;

    const operationsCards = [
      ['🔴 Active Orders', activeOrders],
      ['🟢 Online Restaurants', restaurantsOnline],
      ['🪑 Active Tables', totalTableActivity],
      ['💰 Avg Order Value', formatMoney(averageOrderValue)],
    ];

    const cardsRoot = el('operationsCards');
    if (cardsRoot) {
      cardsRoot.innerHTML = operationsCards.map(([label, value]) => `
        <article class="metric-card metric-card--premium">
          <span class="metric-card__label">${escapeHtml(label)}</span>
          <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
        </article>
      `).join('');
    }

    // Render active orders
    const activeOrdersList = orders
      .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
      .slice(0, 8);

    const activeOrdersRoot = el('activeOrdersList');
    if (activeOrdersRoot) {
      activeOrdersRoot.innerHTML = activeOrdersList.map(order => {
        const restaurant = restaurants.find(r => r.id === order.restaurant_id);
        const statusColor = order.status === 'ready' ? '#4ade80' : order.status === 'preparing' ? '#fbbf24' : '#ef4444';
        return `
          <div class="rank-card">
            <div class="rank-card__index" style="background-color: ${statusColor};">📦</div>
            <div class="rank-card__body">
              <strong>Order #${order.id}</strong>
              <p>${escapeHtml(restaurant?.name || 'Unknown')} • Table ${escapeHtml(order.table_number)}</p>
            </div>
            <div class="rank-card__value">${escapeHtml(formatMoney(order.total_amount))}</div>
          </div>
        `;
      }).join('') || '<p class="muted">No active orders right now.</p>';
    }

    // Render restaurant status
    const restaurantStatusRoot = el('restaurantStatusList');
    if (restaurantStatusRoot) {
      restaurantStatusRoot.innerHTML = restaurants.slice(0, 8).map(r => {
        const statusBadge = r.is_active ? '🟢' : '🔴';
        const tableUtilization = r.total_tables > 0 
          ? Math.round((r.active_tables / r.total_tables) * 100) 
          : 0;
        return `
          <div class="rank-card">
            <div class="rank-card__index">${statusBadge}</div>
            <div class="rank-card__body">
              <strong>${escapeHtml(r.name)}</strong>
              <p>${escapeHtml(r.owner_name || 'No owner')} • ${r.active_tables}/${r.total_tables} tables</p>
            </div>
            <div class="rank-card__value">${tableUtilization}%</div>
          </div>
        `;
      }).join('') || '<p class="muted">No restaurant data.</p>';
    }
  }

  // ===== MESSAGING SYSTEM =====
  function populateRestaurantCheckboxes() {
    const restaurants = getDashboard().restaurants || [];
    const container = el('specificRestaurantsList');
    if (!container) return;

    container.innerHTML = restaurants.map(r => `
      <label class="admin-check">
        <input type="checkbox" class="restaurant-checkbox" value="${r.id}" />
        <span>${escapeHtml(r.name)}</span>
      </label>
    `).join('');

    container.querySelectorAll('.restaurant-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          state.selectedRestaurants.add(e.target.value);
        } else {
          state.selectedRestaurants.delete(e.target.value);
        }
      });
    });
  }

  function handleRecipientTypeChange(value) {
    const container = el('specificRestaurantsList');
    if (!container) return;

    if (value === 'specific') {
      container.style.display = 'block';
      populateRestaurantCheckboxes();
    } else {
      container.style.display = 'none';
      state.selectedRestaurants.clear();
    }
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const recipientType = formData.get('recipientType');
    const recipientIds = recipientType === 'specific' 
      ? Array.from(state.selectedRestaurants).map(Number)
      : [];

    if (recipientType === 'specific' && recipientIds.length === 0) {
      setMessage('Please select at least one restaurant for specific messages.', true);
      return;
    }

    try {
      const response = await apiRequest('/api/admin/messages', {
        method: 'POST',
        body: JSON.stringify({
          title: formData.get('title'),
          content: formData.get('content'),
          messageType: formData.get('messageType'),
          priority: formData.get('priority'),
          recipientType: recipientType,
          recipientIds: recipientIds,
          isBroadcast: formData.get('isBroadcast') === 'on',
          expiresAt: formData.get('expiresAt') || null,
        }),
      }, true);

      event.currentTarget.reset();
      state.selectedRestaurants.clear();
      handleRecipientTypeChange('');
      await loadMessages();
      setMessage(`Message sent to ${response.recipientCount} restaurants successfully! ✅`);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function loadMessages() {
    try {
      const data = await apiRequest('/api/admin/messages', {}, true);
      state.messages = data.messages || [];
      renderMessagesList();
    } catch (error) {
      setMessage('Failed to load messages.', true);
    }
  }

  function renderMessagesList() {
    const messages = state.messages || [];
    const root = el('messagesList');
    if (!root) return;

    root.innerHTML = messages.map(msg => {
      const typeIcon = {
        'announcement': '📢',
        'alert': '⚠️',
        'notice': '📋',
        'offer': '🎁',
      }[msg.message_type] || '📝';

      const priorityColor = {
        'urgent': '#dc2626',
        'high': '#f97316',
        'normal': '#3b82f6',
        'low': '#6b7280',
      }[msg.priority] || '#3b82f6';

      const readPercentage = msg.recipientCount > 0 
        ? Math.round((msg.readCount / msg.recipientCount) * 100)
        : 0;

      return `
        <article class="admin-item">
          <div class="admin-item__header">
            <div>
              <h4>${typeIcon} ${escapeHtml(msg.title)}</h4>
              <p>${escapeHtml(msg.content.substring(0, 80))}...</p>
            </div>
            <span class="badge" style="background-color: ${priorityColor};">${msg.priority.toUpperCase()}</span>
          </div>
          <div class="admin-item__metrics">
            <span>Sent: ${escapeHtml(formatDate(msg.created_at))}</span>
            <span>Recipients: ${msg.recipientCount}</span>
            <span>Read: ${msg.readCount}/${msg.recipientCount} (${readPercentage}%)</span>
            <span>${msg.is_broadcast ? '📡 Broadcast' : '🎯 Targeted'}</span>
          </div>
          <div class="admin-item__actions">
            <button class="btn btn-light" data-message-view="${msg.id}">View details</button>
            <button class="btn btn-dark" data-message-delete="${msg.id}">Delete</button>
          </div>
        </article>
      `;
    }).join('') || '<p class="muted">No messages sent yet. Create one above!</p>';

    // Attach event listeners
    root.querySelectorAll('[data-message-view]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const messageId = btn.dataset.messageView;
        try {
          const data = await apiRequest(`/api/admin/messages/${messageId}`, {}, true);
          showMessageDetails(data);
        } catch (error) {
          setMessage('Failed to load message details.', true);
        }
      });
    });

    root.querySelectorAll('[data-message-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try {
          await apiRequest(`/api/admin/messages/${btn.dataset.messageDelete}`, { method: 'DELETE' }, true);
          await loadMessages();
          setMessage('Message deleted successfully.');
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });
  }

  function showMessageDetails(messageData) {
    const { message, recipients, stats } = messageData;
    const detailsHtml = `
      <h3>${escapeHtml(message.title)}</h3>
      <p style="margin: 1rem 0; line-height: 1.6;">${escapeHtml(message.content)}</p>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1.5rem 0;">
        <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">${stats.total}</div>
          <div style="color: #6b7280; font-size: 0.875rem;">Total Recipients</div>
        </div>
        <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${stats.read}</div>
          <div style="color: #6b7280; font-size: 0.875rem;">Read</div>
        </div>
        <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${stats.unread}</div>
          <div style="color: #6b7280; font-size: 0.875rem;">Unread</div>
        </div>
        <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${Math.round((stats.read / stats.total) * 100)}%</div>
          <div style="color: #6b7280; font-size: 0.875rem;">Read Rate</div>
        </div>
      </div>
      <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Recipients:</h4>
      <div style="max-height: 300px; overflow-y: auto;">
        ${recipients.map(r => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid #e5e7eb;">
            <div>
              <div style="font-weight: 500;">${escapeHtml(r.restaurant_name)}</div>
              <div style="font-size: 0.875rem; color: #6b7280;">${escapeHtml(r.owner_email || 'N/A')}</div>
            </div>
            <span style="padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; background-color: ${r.is_read ? '#d1fae5' : '#fee2e2'}; color: ${r.is_read ? '#065f46' : '#991b1b'};">
              ${r.is_read ? '✓ Read' : 'Unread'}
            </span>
          </div>
        `).join('')}
      </div>
    `;

    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; max-width: 600px; max-height: 80vh; overflow-y: auto; padding: 2rem; width: 90%;">
        ${detailsHtml}
        <button class="btn btn-light" style="margin-top: 2rem; width: 100%;" onclick="this.closest('div').parentElement.remove();">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function attachMessageEvents() {
    const messageForm = el('messageForm');
    if (messageForm) {
      messageForm.addEventListener('submit', handleMessageSubmit);

      const recipientTypeSelect = messageForm.querySelector('[name="recipientType"]');
      if (recipientTypeSelect) {
        recipientTypeSelect.addEventListener('change', (e) => {
          handleRecipientTypeChange(e.target.value);
        });
      }
    }

    const messageFilter = el('messageFilter');
    const messageSearch = el('messageSearch');
    if (messageFilter) {
      messageFilter.addEventListener('change', loadMessages);
    }
    if (messageSearch) {
      messageSearch.addEventListener('input', loadMessages);
    }
  }

  async function handleRestaurantCreate(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      await apiRequest('/api/auth/register-owner', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          restaurantName: formData.get('restaurantName'),
          totalTables: Number(formData.get('totalTables')),
          phone: formData.get('phone') || '',
          address: formData.get('address') || '',
        }),
      });

      event.currentTarget.reset();
      await loadDashboard();
      setMessage('Restaurant created successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function handleAdSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const adId = String(formData.get('adId') || '').trim();

    const payload = {
      title: formData.get('title'),
      imageUrl: formData.get('imageUrl'),
      targetLink: formData.get('targetLink'),
      restaurantId: formData.get('restaurantId') ? Number(formData.get('restaurantId')) : null,
      isActive: formData.get('isActive') === 'on',
      startsAt: formData.get('startsAt') || null,
      endsAt: formData.get('endsAt') || null,
    };

    try {
      if (adId) {
        await apiRequest(`/api/ads/${adId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, true);
      } else {
        await apiRequest('/api/ads', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, true);
      }

      resetAdForm();
      await loadDashboard();
      setMessage(adId ? 'Ad updated successfully.' : 'Ad created successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function attachEvents() {
    document.querySelectorAll('.admin-link[data-section]').forEach((button) => {
      button.addEventListener('click', () => setSection(button.dataset.section));
    });

    const searchInput = el('dashboardSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.query = searchInput.value;
        renderRestaurantList();
        renderAdsList();
        renderAnalytics();
      });
    }

    const refreshButton = el('refreshDashboard');
    if (refreshButton) refreshButton.addEventListener('click', loadDashboard);

    const sidebarRefresh = el('sidebarRefresh');
    if (sidebarRefresh) sidebarRefresh.addEventListener('click', loadDashboard);

    const logoutButton = el('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        clearAuth();
        window.location.href = './auth.html';
      });
    }

    const restaurantForm = el('restaurantForm');
    if (restaurantForm) restaurantForm.addEventListener('submit', handleRestaurantCreate);

    const adForm = el('adForm');
    if (adForm) adForm.addEventListener('submit', handleAdSubmit);

    const adCancelButton = el('adCancelButton');
    if (adCancelButton) adCancelButton.addEventListener('click', resetAdForm);

    // Attach messaging events
    attachMessageEvents();
  }

  function ensureAdminAuth() {
    const auth = getAuth();
    if (!auth || !auth.token || auth.user.role !== 'super_admin') {
      setMessage('Please login as super admin from the auth page.', true);
      window.location.href = './auth.html';
      return null;
    }

    return auth;
  }

  async function init() {
    if (!ensureAdminAuth()) return;
    attachEvents();
    setSection('overview');
    resetAdForm();

    try {
      await loadDashboard();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  init();
})();
