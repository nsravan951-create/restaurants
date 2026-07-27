(function () {
  const state = {
    dashboard: null,
    query: '',
    editingAdId: null,
    activeSection: 'overview',
    messages: [],
    selectedRestaurants: new Set(),
    operations: null,
    platformOrders: [],
    saasProfits: null,
    paymentVaultUnlocked: false,
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

    if (section === 'profits') loadSaasProfits();
    if (section === 'platform') loadPlatformOrders();
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

  function populateRestaurantSelects() {
    const restaurants = getDashboard().restaurants || [];
    const options = restaurants.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

    ['platformRestaurantSelect', 'paymentRestaurantSelect', 'platformInvoiceRestaurantSelect'].forEach((id) => {
      const select = el(id);
      if (!select) return;
      const placeholder = id === 'paymentRestaurantSelect'
        ? '<option value="">Select restaurant to view payment details</option>'
        : '<option value="">Select restaurant</option>';
      select.innerHTML = placeholder + options;
    });
  }

  async function loadInvoicesForRestaurant(restaurantId) {
    const listRoot = el('platformInvoicesList');
    if (!restaurantId) {
      if (listRoot) listRoot.innerHTML = '<p class="muted">Select a restaurant to load its synced invoices.</p>';
      return;
    }

    try {
      const data = await apiRequest(`/api/invoices/restaurant/${restaurantId}`, {}, true);
      renderInvoiceList(data.invoices || []);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function renderInvoiceList(invoices) {
    const listRoot = el('platformInvoicesList');
    if (!listRoot) return;

    listRoot.innerHTML = invoices.map((invoice) => {
      const items = Array.isArray(invoice.items_json) ? invoice.items_json : (invoice.items_json ? JSON.parse(invoice.items_json) : []);
      const itemsText = items.map((item) => `${escapeHtml(item.name)} x${escapeHtml(String(item.quantity))}`).join(', ');
      return `
        <article class="admin-item">
          <div class="admin-item__header">
            <div>
              <h4>Invoice #${escapeHtml(String(invoice.order_id || invoice.id))}</h4>
              <p>${escapeHtml(invoice.customer_name || 'Guest')} • Table ${escapeHtml(invoice.table_number)}</p>
            </div>
            <span class="badge badge--muted">${escapeHtml(invoice.payment_status)}</span>
          </div>
          <div class="admin-item__metrics">
            <span>Total: ${escapeHtml(formatMoney(invoice.total_amount || 0))}</span>
            <span>Created: ${escapeHtml(formatDate(invoice.synced_at))}</span>
            <span>Items: ${escapeHtml(itemsText || 'No item details')}</span>
          </div>
        </article>
      `;
    }).join('') || '<p class="muted">No synced invoices found for this restaurant.</p>';
  }

  async function handlePaymentDetailsSubmit(event) {
    event.preventDefault();
    if (!state.paymentVaultUnlocked) {
      setMessage('Unlock payment vault first.', true);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const restaurantId = el('paymentRestaurantSelect')?.value;

    if (!restaurantId) {
      setMessage('Select a restaurant first.', true);
      return;
    }

    try {
      const payload = {
        upiVpa: formData.get('upiVpa'),
        bankAccountName: formData.get('bankAccountName'),
        bankName: formData.get('bankName'),
        phone: formData.get('phone'),
        address: formData.get('address'),
      };

      await apiRequest(`/api/admin/restaurants/${restaurantId}/payment-details`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }, true);

      setMessage('Payment details updated successfully.');
      await loadPaymentDetails(restaurantId);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function loadSaasProfits() {
    try {
      state.saasProfits = await apiRequest('/api/admin/saas-profits', {}, true);
      renderSaasProfits();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function renderSaasProfits() {
    const data = state.saasProfits;
    if (!data) return;

    const m = data.monthly || {};
    const cards = [
      ['Total Profit', formatMoney(m.totalProfit || 0)],
      ['Dine-in (QR)', formatMoney(m.dineInRevenue || 0)],
      ['Cash / COD', formatMoney(m.offlineRevenue || 0)],
      ['Aggregator Gross', formatMoney(m.platformGross || 0)],
      ['Aggregator Net', formatMoney(m.platformNet || 0)],
      ['Commission Paid', formatMoney(m.platformCommission || 0)],
      ['Online Orders', m.onlineOrders || 0],
      ['Platform Orders', m.platformOrders || 0],
    ];

    const root = el('saasProfitCards');
    if (root) {
      root.innerHTML = cards.map(([label, value]) => `
        <article class="metric-card metric-card--premium">
          <span class="metric-card__label">${escapeHtml(label)}</span>
          <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
        </article>
      `).join('');
    }

    const channels = data.channelBreakdown || [];
    const maxRev = Math.max(...channels.map((c) => Number(c.revenue || 0)), 1);
    const channelRoot = el('channelBreakdown');
    if (channelRoot) {
      channelRoot.innerHTML = channels.map((ch) => {
        const rev = Number(ch.revenue || 0);
        const width = Math.max((rev / maxRev) * 100, 4);
        return `
          <div class="trend-row">
            <div class="trend-row__meta">
              <span>${escapeHtml(ch.channel)} <small>(${escapeHtml(ch.type)})</small></span>
              <strong>${escapeHtml(formatMoney(rev))}</strong>
            </div>
            <div class="trend-bar"><span style="width:${width}%"></span></div>
          </div>
        `;
      }).join('');
    }

    const subs = data.subscriptions || {};
    const subRoot = el('subscriptionStats');
    if (subRoot) {
      subRoot.innerHTML = `
        <div class="rank-card"><div class="rank-card__body"><strong>Active subscriptions</strong></div><div class="rank-card__value">${escapeHtml(subs.active_subscriptions || 0)}</div></div>
        <div class="rank-card"><div class="rank-card__body"><strong>Premium plans</strong></div><div class="rank-card__value">${escapeHtml(subs.premium_count || 0)}</div></div>
        <div class="rank-card"><div class="rank-card__body"><strong>Basic plans</strong></div><div class="rank-card__value">${escapeHtml(subs.basic_count || 0)}</div></div>
      `;
    }
  }

  async function loadPlatformOrders() {
    try {
      const data = await apiRequest('/api/platform-orders', {}, true);
      state.platformOrders = data.orders || [];
      const summary = await apiRequest('/api/platform-orders/summary', {}, true);
      renderPlatformOrders(summary.summary || []);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function renderPlatformOrders(summary) {
    const orders = state.platformOrders || [];
    const platformIcons = { swiggy: '🟠', zomato: '🔴', dunzo: '🟢', uber_eats: '⚫', other: '📦' };

    const summaryRoot = el('platformSummaryCards');
    if (summaryRoot) {
      summaryRoot.innerHTML = (summary.length ? summary : [{ platform: 'none', order_count: 0, gross_revenue: 0 }]).map((row) => `
        <article class="metric-card metric-card--soft">
          <span class="metric-card__label">${escapeHtml((platformIcons[row.platform] || '') + ' ' + (row.platform || 'No orders'))}</span>
          <strong class="metric-card__value">${escapeHtml(formatMoney(row.gross_revenue || 0))} (${row.order_count || 0})</strong>
        </article>
      `).join('');
    }

    const listRoot = el('platformOrdersList');
    if (!listRoot) return;

    listRoot.innerHTML = orders.map((order) => {
      const items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
      const itemsText = items.map((i) => `${i.name} x${i.quantity}`).join(', ') || '—';
      return `
        <article class="admin-item">
          <div class="admin-item__header">
            <div>
              <h4>${platformIcons[order.platform] || '📦'} ${escapeHtml(order.platform)} — #${escapeHtml(order.external_order_id || order.id)}</h4>
              <p>${escapeHtml(order.restaurant_name || '')} • ${escapeHtml(order.customer_name || 'Guest')}</p>
            </div>
            <span class="badge badge--success">${escapeHtml(order.status)}</span>
          </div>
          <div class="admin-item__metrics">
            <span>Total: ${escapeHtml(formatMoney(order.total_amount))}</span>
            <span>Net: ${escapeHtml(formatMoney(order.net_amount))}</span>
            <span>Commission: ${escapeHtml(formatMoney(order.commission_amount))}</span>
            <span>Items: ${escapeHtml(itemsText)}</span>
            <span>${escapeHtml(formatDate(order.created_at))}</span>
          </div>
          <div class="admin-item__actions">
            <button class="btn btn-light" data-platform-status="${order.id}" data-status="preparing">Preparing</button>
            <button class="btn btn-primary" data-platform-status="${order.id}" data-status="ready">Ready</button>
            <button class="btn btn-dark" data-platform-status="${order.id}" data-status="delivered">Delivered</button>
          </div>
        </article>
      `;
    }).join('') || '<p class="muted">No platform orders yet. Record a Swiggy or Zomato order above.</p>';

    listRoot.querySelectorAll('[data-platform-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/platform-orders/${btn.dataset.platformStatus}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: btn.dataset.status }),
          }, true);
          await loadPlatformOrders();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });
  }

  async function handlePlatformOrderSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const itemsSummary = formData.get('itemsSummary') || '';
    const items = itemsSummary.split(',').map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/^(.+?)\s*x(\d+)$/i);
      if (match) return { name: match[1].trim(), quantity: Number(match[2]), price: 0 };
      return { name: trimmed, quantity: 1, price: 0 };
    }).filter((i) => i.name);

    try {
      await apiRequest('/api/platform-orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: Number(formData.get('restaurantId')),
          platform: formData.get('platform'),
          externalOrderId: formData.get('externalOrderId') || null,
          customerName: formData.get('customerName') || null,
          totalAmount: Number(formData.get('totalAmount')),
          commissionAmount: Number(formData.get('commissionAmount') || 0),
          status: formData.get('status') || 'received',
          items,
        }),
      }, true);
      event.currentTarget.reset();
      await loadPlatformOrders();
      setMessage('Platform order recorded successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function renderPromoPreview() {
    const ads = getFilteredAds().filter((ad) => ad.isActive && ['vertical', 'grid'].includes(ad.displayMode || ad.display_mode));
    const root = el('promoPreview');
    if (!root) return;

    root.innerHTML = ads.length ? `
      <p class="eyebrow">Customer preview — promotions stay in grid, never collapsed</p>
      <div class="promo-preview-grid__inner">
        ${ads.map((ad) => {
          const mediaType = ad.mediaType || ad.media_type || 'image';
          const videoUrl = ad.videoUrl || ad.video_url;
          const imageUrl = ad.imageUrl || ad.image_url;
          if (mediaType === 'video' && videoUrl) {
            return `<div class="promo-preview-card promo-preview-card--video"><video src="${escapeHtml(videoUrl)}" muted loop playsinline autoplay></video><span>${escapeHtml(ad.title)}</span></div>`;
          }
          return `<div class="promo-preview-card"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(ad.title)}" /><span>${escapeHtml(ad.title)}</span></div>`;
        }).join('')}
      </div>
    ` : '';
  }

  function openPaymentAuthModal() {
    const modal = el('paymentAuthModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    el('paymentAuthPassword')?.focus();
  }

  function closePaymentAuthModal() {
    const modal = el('paymentAuthModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function unlockPaymentVault(password) {
    await apiRequest('/api/auth/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, true);
    state.paymentVaultUnlocked = true;
    closePaymentAuthModal();
    el('paymentVaultContent')?.classList.remove('hidden');
    const panel = el('paymentVaultPanel');
    if (panel) panel.querySelector('.muted')?.classList.add('hidden');
    setMessage('Payment vault unlocked for this session.');

    const selectedRestaurantId = el('paymentRestaurantSelect')?.value;
    if (selectedRestaurantId) {
      await loadPaymentDetails(selectedRestaurantId);
    }
  }

  async function loadPaymentDetails(restaurantId) {
    if (!state.paymentVaultUnlocked || !restaurantId) return;
    try {
      const data = await apiRequest(`/api/admin/restaurants/${restaurantId}/payment-details`, {}, true);
      const r = data.restaurant || {};
      const form = el('paymentDetailsForm');
      if (form) {
        form.classList.remove('hidden');
        form.querySelector('[name="upiVpa"]').value = r.upi_vpa || '';
        form.querySelector('[name="bankAccountName"]').value = r.bank_account_name || '';
        form.querySelector('[name="bankName"]').value = r.bank_name || '';
        form.querySelector('[name="phone"]').value = r.phone || '';
        form.querySelector('[name="address"]').value = r.address || '';
      }

      el('paymentDetailsView').innerHTML = `
        <div class="admin-item">
          <div class="admin-item__metrics">
            <span><strong>UPI VPA:</strong> ${escapeHtml(r.upi_vpa || 'Not set')}</span>
            <span><strong>Account holder:</strong> ${escapeHtml(r.bank_account_name || 'Not set')}</span>
            <span><strong>Bank:</strong> ${escapeHtml(r.bank_name || 'Not set')}</span>
            <span><strong>Phone:</strong> ${escapeHtml(r.phone || '—')}</span>
            <span><strong>Address:</strong> ${escapeHtml(r.address || '—')}</span>
          </div>
        </div>
      `;
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function toggleAdMediaFields() {
    const mediaType = el('adMediaType')?.value || 'image';
    el('adImageUrl')?.classList.toggle('hidden', mediaType === 'video');
    el('adVideoUrl')?.classList.toggle('hidden', mediaType !== 'video');
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
    form.querySelector('[name="imageUrl"]').value = ad.imageUrl || ad.image_url || '';
    const videoInput = form.querySelector('[name="videoUrl"]');
    if (videoInput) videoInput.value = ad.videoUrl || ad.video_url || '';
    const mediaTypeSelect = form.querySelector('[name="mediaType"]');
    if (mediaTypeSelect) mediaTypeSelect.value = ad.mediaType || ad.media_type || 'image';
    const displayModeSelect = form.querySelector('[name="displayMode"]');
    if (displayModeSelect) displayModeSelect.value = ad.displayMode || ad.display_mode || 'grid';
    const displayOrderInput = form.querySelector('[name="displayOrder"]');
    if (displayOrderInput) displayOrderInput.value = ad.displayOrder || ad.display_order || 0;
    toggleAdMediaFields();
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
        setSection('promotions');
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
    populateRestaurantSelects();
    renderRestaurantList();
    renderAdsList();
    renderPromoPreview();
    loadMessages();
    if (state.saasProfits) renderSaasProfits();
    if (state.platformOrders.length) renderPlatformOrders([]);
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
      imageUrl: formData.get('imageUrl') || null,
      videoUrl: formData.get('videoUrl') || null,
      mediaType: formData.get('mediaType') || 'image',
      displayMode: formData.get('displayMode') || 'grid',
      displayOrder: Number(formData.get('displayOrder') || 0),
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

    el('adMediaType')?.addEventListener('change', toggleAdMediaFields);

    el('platformOrderForm')?.addEventListener('submit', handlePlatformOrderSubmit);

    el('unlockPaymentsBtn')?.addEventListener('click', openPaymentAuthModal);
    el('cancelPaymentAuthBtn')?.addEventListener('click', closePaymentAuthModal);
    el('paymentAuthForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = el('paymentAuthPassword')?.value;
      try {
        await unlockPaymentVault(password);
      } catch (error) {
        setMessage(error.message, true);
      }
    });
    el('paymentRestaurantSelect')?.addEventListener('change', (e) => {
      loadPaymentDetails(e.target.value);
    });
    el('paymentDetailsForm')?.addEventListener('submit', handlePaymentDetailsSubmit);
    el('platformInvoiceRestaurantSelect')?.addEventListener('change', (e) => {
      loadInvoicesForRestaurant(e.target.value);
    });
    el('refreshInvoicesBtn')?.addEventListener('click', () => {
      loadInvoicesForRestaurant(el('platformInvoiceRestaurantSelect')?.value);
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
      await loadSaasProfits();
      toggleAdMediaFields();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  init();
})();
