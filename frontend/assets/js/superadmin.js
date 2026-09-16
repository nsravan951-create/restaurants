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
    hubRestaurants: [],
    hubQuery: '',
    profileRestaurantId: null,
    profileData: null,
    profileTab: 'overview',
    upgradeStatus: 'pending',
    featureRegistry: [],
    supportStatus: '',
    selectedTicketId: null,
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
    if (section === 'reconciliation') loadReconciliation();
    if (section === 'settlements') loadSettlements();
    if (section === 'team') loadTeamPanel();
    if (section === 'roles') loadRolesPanel();
    if (section === 'activity') loadActivityCenter();
    if (section === 'system') loadSystemHealth();
    if (section === 'audit') loadAuditLogs();
    if (section === 'restaurant-hub') loadRestaurantHub();
    if (section === 'upgrade-queue') loadUpgradeQueue();
    if (section === 'support') loadSupportTickets();
    if (section === 'exports') { /* static panel */ }
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

    // Populate adRestaurantSelect
    const adRestaurantSelect = el('adRestaurantSelect');
    if (adRestaurantSelect) {
      adRestaurantSelect.innerHTML = '<option value="">Global ad</option>' + options;
    }
    
    const adMediaTypeSelect = el('adMediaType');
    const adImageUrlInput = el('adForm').elements.namedItem('imageUrl');
    const adVideoUrlInput = el('adForm').elements.namedItem('videoUrl');

    if (adMediaTypeSelect && adImageUrlInput && adVideoUrlInput) {
      const toggleMediaInputs = () => {
        if (adMediaTypeSelect.value === 'video') {
          adVideoUrlInput.style.display = 'block';
          adImageUrlInput.style.display = 'none';
          adVideoUrlInput.setAttribute('required', 'required');
          adImageUrlInput.removeAttribute('required');
        } else {
          adVideoUrlInput.style.display = 'none';
          adImageUrlInput.style.display = 'block';
          adImageUrlInput.setAttribute('required', 'required');
          adVideoUrlInput.removeAttribute('required');
        }
      };
      adMediaTypeSelect.addEventListener('change', toggleMediaInputs);
      toggleMediaInputs(); // Set initial state
    }
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

  function normalizeAd(ad) {
    return {
      ...ad,
      restaurant_id: ad.restaurant_id ?? ad.restaurantId ?? null,
      target_link: ad.target_link ?? ad.targetLink ?? '',
      is_active: ad.is_active ?? ad.isActive ?? false,
      media_type: ad.media_type ?? ad.mediaType ?? 'image',
      image_url: ad.image_url ?? ad.imageUrl ?? '',
      video_url: ad.video_url ?? ad.videoUrl ?? '',
      display_mode: ad.display_mode ?? ad.displayMode ?? 'grid',
      display_order: ad.display_order ?? ad.displayOrder ?? 0,
    };
  }

  function renderAdsList() {
    const ads = getFilteredAds().map(normalizeAd);
    const adsListRoot = el('adsList');
    if (!adsListRoot) return;

    adsListRoot.innerHTML = ads.map((ad) => `
      <article class="admin-item">
        <div class="admin-item__header">
          <div>
            <h4>${escapeHtml(ad.title)}</h4>
            <p>${ad.restaurant_id ? `Restaurant: ${escapeHtml(ad.restaurant_name || ad.restaurant_id)}` : 'Global Ad'} • Target: <a href="${escapeHtml(ad.target_link)}" target="_blank">${escapeHtml(ad.target_link)}</a></p>
          </div>
          <span class="badge ${ad.is_active ? 'badge--success' : 'badge--muted'}">${ad.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="admin-item__metrics">
          <span>Type: ${escapeHtml(ad.media_type)} (${ad.image_url ? 'Image' : 'Video'})</span>
          <span>Impressions: ${escapeHtml(ad.impressions || 0)}</span>
          <span>Clicks: ${escapeHtml(ad.clicks || 0)}</span>
          <span>CTR: ${ad.impressions ? `${((Number(ad.clicks || 0) / Number(ad.impressions || 1)) * 100).toFixed(2)}%` : '0%'}</span>
        </div>
        <div class="admin-item__actions">
          <button class="btn btn-light" data-action="edit-ad" data-id="${ad.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete-ad" data-id="${ad.id}">Delete</button>
        </div>
      </article>
    `).join('') || '<p class="muted">No ads found.</p>';

    adsListRoot.querySelectorAll('[data-action="edit-ad"]').forEach((btn) => {
      btn.addEventListener('click', handleEditAd);
    });
    adsListRoot.querySelectorAll('[data-action="delete-ad"]').forEach((btn) => {
      btn.addEventListener('click', handleDeleteAd);
    });
  }

  async function loadAds() {
    try {
      const data = await apiRequest('/api/ads', {}, true);
      state.dashboard.ads = data.ads || [];
      renderAdsList();
      renderSummary();
    } catch (error) {
      setMessage(error.message, true);
    }
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
    setMessage('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const adId = formData.get('adId');

    const payload = {
      title: formData.get('title'),
      imageUrl: formData.get('imageUrl') || null,
      videoUrl: formData.get('videoUrl') || null,
      mediaType: formData.get('mediaType'),
      targetLink: formData.get('targetLink'),
      restaurantId: formData.get('restaurantId') ? Number(formData.get('restaurantId')) : null,
      isActive: formData.get('isActive') === 'on',
      startsAt: formData.get('startsAt') || null,
      endsAt: formData.get('endsAt') || null,
      displayOrder: formData.get('displayOrder') ? Number(formData.get('displayOrder')) : 0,
      displayMode: formData.get('displayMode') || 'grid',
    };

    try {
      if (adId) {
        await apiRequest(`/api/ads/${adId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, true);
        setMessage('Ad updated successfully.');
      } else {
        await apiRequest('/api/ads', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, true);
        setMessage('Ad created successfully.');
      }
      form.reset();
      state.editingAdId = null;
      el('adSubmitButton').textContent = 'Create ad';
      el('adCancelButton').classList.add('hidden');
      await loadAds();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function handleEditAd(event) {
    const adId = Number(event.currentTarget.dataset.id);
    const ad = getDashboard().ads.find((a) => a.id === adId);

    if (!ad) return;

    state.editingAdId = adId;
    const form = el('adForm');
    if (!form) return;

    const normalized = normalizeAd(ad);
    form.title.value = normalized.title;
    form.imageUrl.value = normalized.image_url || '';
    form.videoUrl.value = normalized.video_url || '';
    form.mediaType.value = normalized.media_type || 'image';
    form.targetLink.value = normalized.target_link;
    form.restaurantId.value = normalized.restaurant_id || '';
    form.startsAt.value = ad.starts_at ? new Date(ad.starts_at).toISOString().slice(0, 16) : '';
    form.endsAt.value = ad.ends_at ? new Date(ad.ends_at).toISOString().slice(0, 16) : '';
    form.isActive.checked = normalized.is_active;
    form.adId.value = normalized.id;
    form.displayMode.value = normalized.display_mode || 'grid';
    form.displayOrder.value = normalized.display_order || 0;

    // Manually trigger change to update visibility of imageUrl/videoUrl
    const changeEvent = new Event('change');
    el('adMediaType').dispatchEvent(changeEvent);

    el('adSubmitButton').textContent = 'Update ad';
    el('adCancelButton').classList.remove('hidden');
    setSection('promotions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteAd(event) {
    const adId = Number(event.currentTarget.dataset.id);
    if (!confirm('Are you sure you want to delete this ad?')) return;

    try {
      await apiRequest(`/api/ads/${adId}`, {
        method: 'DELETE',
      }, true);
      setMessage('Ad deleted successfully.');
      await loadAds();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function clearAdForm() {
    const form = el('adForm');
    form.reset();
    state.editingAdId = null;
    el('adSubmitButton').textContent = 'Create ad';
    el('adCancelButton').classList.add('hidden');
    
    // Reset media input visibility
    const adMediaTypeSelect = el('adMediaType');
    if (adMediaTypeSelect) {
      adMediaTypeSelect.value = 'image';
      adMediaTypeSelect.dispatchEvent(new Event('change'));
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

    el('hubRefreshBtn')?.addEventListener('click', () => loadRestaurantHub().catch((e) => setMessage(e.message, true)));
    el('hubSearch')?.addEventListener('input', (e) => {
      state.hubQuery = e.target.value;
      renderRestaurantHubTable();
    });
    el('closeProfileModal')?.addEventListener('click', closeRestaurantProfile);
    document.querySelectorAll('[data-profile-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setProfileTab(btn.dataset.profileTab));
    });
    document.querySelectorAll('#upgradeQueueFilters .ma-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#upgradeQueueFilters .ma-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.upgradeStatus = btn.dataset.upgradeStatus;
        loadUpgradeQueue().catch((e) => setMessage(e.message, true));
      });
    });

    document.querySelectorAll('#supportStatusFilters .ma-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#supportStatusFilters .ma-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.supportStatus = btn.dataset.supportStatus || '';
        loadSupportTickets().catch((e) => setMessage(e.message, true));
      });
    });
    el('supportCreateForm')?.addEventListener('submit', handleSupportCreate);
    el('supportReplyForm')?.addEventListener('submit', handleSupportReply);
    document.querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => handleExportClick(btn.dataset.export));
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
    if (adCancelButton) adCancelButton.addEventListener('click', clearAdForm);

    el('reconRefreshBtn')?.addEventListener('click', loadReconciliation);
    el('reconSearch')?.addEventListener('input', () => {
      clearTimeout(window.__reconTimer);
      window.__reconTimer = setTimeout(loadReconciliation, 300);
    });
    el('teamCreateForm')?.addEventListener('submit', (e) => {
      handleTeamCreate(e).catch((error) => setMessage(error.message, true));
    });
    el('teamScopeType')?.addEventListener('change', (e) => {
      el('teamScopeRestaurant')?.classList.toggle('hidden', e.target.value !== 'restaurant');
    });
    el('settlementCreateForm')?.addEventListener('submit', (e) => {
      handleSettlementCreate(e).catch((error) => setMessage(error.message, true));
    });
    el('roleCreateForm')?.addEventListener('submit', (e) => {
      handleRoleCreate(e).catch((error) => setMessage(error.message, true));
    });
    document.querySelectorAll('#dashboardRangeFilters .ma-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#dashboardRangeFilters .ma-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadMasterMetrics(btn.dataset.range).catch(() => {});
      });
    });

    // Attach messaging events
    attachMessageEvents();
  }

  async function loadMasterMetrics(range = '30d') {
    const data = await apiRequest(`/api/master-admin/dashboard?range=${encodeURIComponent(range)}`, {}, true);
    const m = data.metrics || {};
    const root = el('masterMetrics');
    if (!root) return;
    const cards = [
      ['Restaurants', m.total_restaurants],
      ['Active', m.active_restaurants],
      ['Suspended', m.suspended_restaurants],
      ['Period orders', m.period_orders],
      ['Today orders', m.today_orders],
      ['Period GMV', formatMoney(m.period_gmv)],
      ['Today GMV', formatMoney(m.today_gmv)],
      ['Commission', formatMoney(m.period_commission)],
      ['Pending settlements', m.pending_settlements],
      ['Open refunds', m.open_refunds],
      ['Team members', m.active_team_members],
    ];
    root.innerHTML = cards.map(([label, value]) => `
      <article class="summary-card ma-hover-card"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong></article>
    `).join('');
  }

  async function loadSettlements() {
    const data = await apiRequest('/api/master-admin/settlements', {}, true);
    const list = el('settlementsList');
    if (!list) return;
    list.innerHTML = (data.settlements || []).map((s) => `
      <article class="admin-list-item ma-hover-card">
        <div>
          <strong>${escapeHtml(s.restaurant_name)}</strong>
          <p>Net ${formatMoney(s.net_payable)} · ${escapeHtml(s.status)}</p>
          <small>${formatDate(s.period_start)} → ${formatDate(s.period_end)}</small>
        </div>
        <span class="ma-badge ma-badge--${s.status === 'paid' ? 'success' : 'warn'}">${escapeHtml(s.status)}</span>
      </article>
    `).join('') || '<p>No settlements yet.</p>';

    const select = el('settlementRestaurantSelect');
    if (select && select.options.length <= 1) {
      const dash = getDashboard();
      select.innerHTML = '<option value="">Restaurant</option>' + (dash.restaurants || []).map((r) =>
        `<option value="${r.id}">${escapeHtml(r.name)}</option>`
      ).join('');
    }
  }

  async function handleSettlementCreate(event) {
    event.preventDefault();
    const form = event.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    await apiRequest('/api/master-admin/settlements', {
      method: 'POST',
      body: JSON.stringify({
        restaurantId: Number(payload.restaurantId),
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        grossAmount: Number(payload.grossAmount),
        commissionAmount: Number(payload.commissionAmount || 0),
        refundAmount: Number(payload.refundAmount || 0),
        adjustmentAmount: Number(payload.adjustmentAmount || 0),
        notes: payload.notes || '',
      }),
    }, true);
    form.reset();
    setMessage('Settlement created.');
    await loadSettlements();
  }

  async function loadRolesPanel() {
    const data = await apiRequest('/api/master-admin/roles', {}, true);
    const picker = el('rolePermissionsPicker');
    if (picker) {
      picker.innerHTML = (data.permissions || []).map((p) => `
        <label><input type="checkbox" name="permissions" value="${escapeHtml(p.permission_key)}" /> ${escapeHtml(p.permission_key)}</label>
      `).join('');
    }
    const list = el('rolesList');
    if (list) {
      list.innerHTML = (data.roles || []).map((r) => `
        <article class="admin-list-item ma-hover-card">
          <div>
            <strong>${escapeHtml(r.name)}</strong>
            <p>${escapeHtml(r.role_key)} · ${escapeHtml(r.department_name || 'No department')}</p>
            <small>${(r.permissions || []).map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join(' ')}</small>
          </div>
          <span class="ma-badge ma-badge--muted">${r.is_system ? 'System' : 'Custom'}</span>
        </article>
      `).join('') || '<p>No roles found. Run migration 012.</p>';
    }
  }

  async function handleRoleCreate(event) {
    event.preventDefault();
    const form = event.target;
    const fd = new FormData(form);
    const permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map((n) => n.value);
    await apiRequest('/api/master-admin/roles', {
      method: 'POST',
      body: JSON.stringify({
        roleKey: fd.get('roleKey'),
        name: fd.get('name'),
        description: fd.get('description') || '',
        permissions,
      }),
    }, true);
    form.reset();
    setMessage('Role created.');
    await loadRolesPanel();
    await loadTeamPanel();
  }

  async function loadActivityCenter() {
    const data = await apiRequest('/api/master-admin/activity?limit=120', {}, true);
    const root = el('activityFeed');
    if (!root) return;
    const audit = (data.auditLogs || []).map((log) => `
      <article class="admin-list-item ma-hover-card">
        <div>
          <strong>${escapeHtml(log.action)}</strong>
          <p>${escapeHtml(log.actor_name || 'System')} · ${escapeHtml(log.resource_type)} ${escapeHtml(log.resource_id || '')}</p>
          <small>${formatDate(log.created_at)}</small>
        </div>
      </article>
    `).join('');
    const logins = (data.loginActivity || []).slice(0, 20).map((row) => `
      <article class="admin-list-item ma-hover-card">
        <div>
          <strong>${row.success ? 'Login success' : 'Login failed'}</strong>
          <p>${escapeHtml(row.user_name || row.email || '—')}</p>
          <small>${formatDate(row.created_at)}</small>
        </div>
        <span class="ma-badge ma-badge--${row.success ? 'success' : 'danger'}">${row.success ? 'OK' : 'Fail'}</span>
      </article>
    `).join('');
    root.innerHTML = audit + logins || '<p>No activity recorded.</p>';
  }

  async function loadSystemHealth() {
    const data = await apiRequest('/api/master-admin/system/health', {}, true);
    const root = el('systemHealthGrid');
    if (!root) return;
    root.innerHTML = `
      <article class="ma-health-card ma-hover-card"><h4>Backend</h4><strong class="ma-badge ma-badge--success">${escapeHtml(data.backend)}</strong></article>
      <article class="ma-health-card ma-hover-card"><h4>Database</h4><strong class="ma-badge ma-badge--${data.database === 'connected' ? 'success' : 'danger'}">${escapeHtml(data.database)}</strong></article>
      <article class="ma-health-card ma-hover-card"><h4>Cashfree</h4><strong class="ma-badge ma-badge--${data.cashfree?.status === 'connected' ? 'success' : 'warn'}">${escapeHtml(data.cashfree?.status || 'unknown')}</strong></article>
      <article class="ma-health-card ma-hover-card"><h4>Socket.IO</h4><strong>${escapeHtml(data.socketIo || '—')}</strong></article>
      <article class="ma-health-card ma-hover-card"><h4>Last migration</h4><strong>${escapeHtml(data.migrations?.[0]?.version || '—')}</strong></article>
    `;
  }

  async function loadReconciliation() {
    const q = el('reconSearch')?.value || '';
    const data = await apiRequest(`/api/admin/reconciliation/transactions?q=${encodeURIComponent(q)}`, {}, true);
    const summary = data.summary || {};
    const root = el('reconSummaryCards');
    if (root) {
      root.innerHTML = [
        ['Gross paid', formatMoney(summary.gross_paid)],
        ['Total commission', formatMoney(summary.total_commission)],
        ['Net to restaurants', formatMoney(summary.net_to_restaurants)],
        ['Records', summary.total_count || 0],
      ].map(([label, value]) => `<article class="summary-card"><p>${label}</p><strong>${value}</strong></article>`).join('');
    }

    const rows = data.transactions || [];
    const table = el('reconTable');
    if (!table) return;
    table.innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>Order</th><th>Restaurant</th><th>Gross</th><th>Commission</th><th>Restaurant amt</th>
          <th>Cashfree order</th><th>Payment</th><th>Date</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>#${r.order_id}<div class="small">${escapeHtml(r.invoice_number || '')}</div></td>
              <td>${escapeHtml(r.restaurant_name)}</td>
              <td>${formatMoney(r.gross_amount)}</td>
              <td>${formatMoney(r.commission_amount)}</td>
              <td>${formatMoney(r.restaurant_amount)}</td>
              <td><small>${escapeHtml(r.cashfree_order_id || '—')}</small></td>
              <td>${escapeHtml(r.payment_status)} / ${escapeHtml(r.payment_provider || '')}</td>
              <td>${formatDate(r.created_at)}</td>
            </tr>
          `).join('') || '<tr><td colspan="8">No transactions found.</td></tr>'}
        </tbody>
      </table>`;
  }

  function updateTeamRoleDescription(roleKey, roleMeta) {
    const desc = el('teamRoleDescription');
    if (!desc) return;
    const meta = (roleMeta || []).find((r) => r.role_key === roleKey);
    desc.textContent = meta?.description || '';
  }

  function selectTeamRole(roleKey, roleMeta) {
    const roleSelect = el('teamRoleSelect');
    if (roleSelect) roleSelect.value = roleKey;
    updateTeamRoleDescription(roleKey, roleMeta);
    document.querySelectorAll('.ma-role-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.roleKey === roleKey);
    });
  }

  async function loadTeamPanel() {
    const rolesData = await apiRequest('/api/team/roles', {}, true);
    const membersData = await apiRequest('/api/team/members', {}, true);
    const roleMeta = rolesData.roleMeta || [];

    const catalogRoot = el('teamRoleCatalog');
    if (catalogRoot) {
      const byDept = rolesData.rolesByDepartment || {};
      const deptKeys = Object.keys(byDept).length ? Object.keys(byDept) : ['All'];
      catalogRoot.innerHTML = deptKeys.flatMap((dept) => {
        const rows = byDept[dept] || roleMeta;
        return rows.map((r) => `
          <button type="button" class="ma-role-card" data-role-key="${escapeHtml(r.role_key)}">
            <span class="ma-role-card__dept">${escapeHtml(dept)}</span>
            <strong>${escapeHtml(r.name || r.role_key)}</strong>
            <small>${escapeHtml(r.description || '')}</small>
          </button>
        `);
      }).join('');

      catalogRoot.querySelectorAll('.ma-role-card').forEach((btn) => {
        btn.addEventListener('click', () => selectTeamRole(btn.dataset.roleKey, roleMeta));
      });
    }

    const roleSelect = el('teamRoleSelect');
    if (roleSelect) {
      const grouped = rolesData.rolesByDepartment || {};
      let optionsHtml = '';
      if (Object.keys(grouped).length) {
        optionsHtml = Object.entries(grouped).map(([dept, rows]) => `
          <optgroup label="${escapeHtml(dept)}">
            ${rows.map((r) => `<option value="${escapeHtml(r.role_key)}">${escapeHtml(r.name)}</option>`).join('')}
          </optgroup>
        `).join('');
      } else {
        optionsHtml = roleMeta.map((r) => `<option value="${escapeHtml(r.role_key)}">${escapeHtml(r.name)}</option>`).join('');
      }
      roleSelect.innerHTML = '<option value="">Select role</option>' + optionsHtml;
      roleSelect.onchange = () => {
        selectTeamRole(roleSelect.value, roleMeta);
      };
    }

    const matrix = el('teamRoleMatrix');
    if (matrix) {
      const permMap = {};
      (rolesData.mappings || []).forEach((row) => {
        if (!permMap[row.role]) permMap[row.role] = [];
        permMap[row.role].push(row.permission_key);
      });
      matrix.innerHTML = roleMeta.map((r) => {
        const perms = permMap[r.role_key] || [];
        return `
          <article>
            <strong>${escapeHtml(r.name)}</strong>
            <p class="muted" style="margin:0.2rem 0 0.45rem;">${escapeHtml(r.description || '')}</p>
            <p>${perms.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join('') || '<span class="muted">No permissions mapped</span>'}</p>
          </article>
        `;
      }).join('');
    }

    const scopeRestaurant = el('teamScopeRestaurant');
    if (scopeRestaurant && scopeRestaurant.options.length <= 1) {
      const restaurants = state.hubRestaurants.length
        ? state.hubRestaurants
        : (getDashboard().restaurants || []);
      scopeRestaurant.innerHTML = '<option value="">Select restaurant for scope</option>' + restaurants.map((r) => (
        `<option value="${r.id}">${escapeHtml(r.name)}</option>`
      )).join('');
    }

    const list = el('teamMembersList');
    if (list) {
      const roleOptions = roleMeta.map((r) => `<option value="${escapeHtml(r.role_key)}">${escapeHtml(r.name)}</option>`).join('');
      list.innerHTML = (membersData.members || []).map((m) => `
        <article class="admin-list-item ma-hover-card">
          <div>
            <strong>${escapeHtml(m.name)}</strong>
            <p>${escapeHtml(m.email)}${m.username ? ` · @${escapeHtml(m.username)}` : ''}</p>
            <p>${escapeHtml(m.role.replace(/_/g, ' '))} · Scope: ${escapeHtml(m.scope_type || 'global')}</p>
            <small>Last login: ${formatDate(m.last_login_at)}</small>
          </div>
          <div class="ma-member-actions">
            <span class="ma-badge ma-badge--${m.is_active ? 'success' : 'danger'}">${m.is_active ? 'Active' : 'Inactive'}</span>
            <select class="admin-select" data-member-role="${m.id}" style="max-width:180px;">
              ${roleOptions}
            </select>
            <button class="btn btn-light btn-sm" type="button" data-save-role="${m.id}">Save role</button>
            <button class="btn btn-light btn-sm" type="button" data-toggle-active="${m.id}" data-active="${m.is_active ? '1' : '0'}">
              ${m.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-light btn-sm" type="button" data-reset-pw="${m.id}">Reset password</button>
          </div>
        </article>
      `).join('') || '<p>No team members yet. Create one above.</p>';

      list.querySelectorAll('[data-member-role]').forEach((select) => {
        const member = (membersData.members || []).find((row) => String(row.id) === select.dataset.memberRole);
        if (member) select.value = member.role;
      });

      list.querySelectorAll('[data-save-role]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.saveRole;
          const role = list.querySelector(`[data-member-role="${userId}"]`)?.value;
          try {
            await apiRequest(`/api/team/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }, true);
            setMessage('Role updated.');
            await loadTeamPanel();
          } catch (error) {
            setMessage(error.message, true);
          }
        });
      });

      list.querySelectorAll('[data-toggle-active]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.toggleActive;
          const isActive = btn.dataset.active === '1';
          try {
            await apiRequest(`/api/team/members/${userId}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive: !isActive, forceLogout: isActive }),
            }, true);
            setMessage(isActive ? 'Member deactivated.' : 'Member activated.');
            await loadTeamPanel();
          } catch (error) {
            setMessage(error.message, true);
          }
        });
      });

      list.querySelectorAll('[data-reset-pw]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const password = prompt('Enter new password (min 8 characters):');
          if (!password || password.length < 8) return;
          try {
            await apiRequest(`/api/team/members/${btn.dataset.resetPw}`, {
              method: 'PATCH',
              body: JSON.stringify({ password, forceLogout: true }),
            }, true);
            setMessage('Password reset.');
          } catch (error) {
            setMessage(error.message, true);
          }
        });
      });
    }
  }

  async function handleTeamCreate(event) {
    event.preventDefault();
    const form = event.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (!payload.scopeRestaurantId) delete payload.scopeRestaurantId;
    if (!payload.username) delete payload.username;
    await apiRequest('/api/team/members', { method: 'POST', body: JSON.stringify(payload) }, true);
    form.reset();
    setMessage('Team member created with allocated role.');
    await loadTeamPanel();
  }

  async function loadAuditLogs() {
    const data = await apiRequest('/api/admin/audit-logs?limit=150', {}, true);
    const root = el('auditLogsList');
    if (!root) return;
    root.innerHTML = (data.logs || []).map((log) => `
      <article class="admin-list-item">
        <div>
          <strong>${escapeHtml(log.action)}</strong>
          <p>${escapeHtml(log.resource_type)} ${escapeHtml(log.resource_id || '')} · role ${escapeHtml(log.actor_role || '—')}</p>
          <small>${formatDate(log.created_at)}</small>
        </div>
      </article>
    `).join('') || '<p>No audit logs recorded yet.</p>';
  }

  function statusBadge(active, labelOn = 'Active', labelOff = 'Inactive') {
    return `<span class="ma-badge ${active ? 'ma-badge--success' : 'ma-badge--muted'}">${active ? labelOn : labelOff}</span>`;
  }

  async function loadFeatureRegistry() {
    if (state.featureRegistry.length) return state.featureRegistry;
    try {
      const data = await apiRequest('/api/master-admin/features/registry', {}, true);
      state.featureRegistry = data.features || [];
    } catch (_) {
      state.featureRegistry = [];
    }
    return state.featureRegistry;
  }

  async function loadRestaurantHub() {
    const data = await apiRequest('/api/master-admin/restaurants', {}, true);
    state.hubRestaurants = data.restaurants || [];
    renderRestaurantHubTable();
  }

  function getFilteredHubRestaurants() {
    const q = state.hubQuery.trim().toLowerCase();
    if (!q) return state.hubRestaurants;
    return state.hubRestaurants.filter((r) => [
      r.name, r.owner_name, r.owner_email, r.gstin, String(r.id),
    ].join(' ').toLowerCase().includes(q));
  }

  function renderRestaurantHubTable() {
    const root = el('restaurantHubTable');
    if (!root) return;
    const rows = getFilteredHubRestaurants();
    root.innerHTML = `
      <table class="ma-data-table">
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Features</th>
            <th>Upgrades</th>
            <th>GSTIN</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td><strong>${escapeHtml(r.name)}</strong><br><small class="muted">#${r.id}</small></td>
              <td>${escapeHtml(r.owner_name || '—')}<br><small class="muted">${escapeHtml(r.owner_email || '')}</small></td>
              <td>${statusBadge(r.is_active)}</td>
              <td>${escapeHtml(r.subscription_plan || '—')}<br><small class="muted">${escapeHtml(r.subscription_status || '')}</small></td>
              <td>${escapeHtml(r.enabled_features_count || 0)} enabled</td>
              <td>
                ${Number(r.pending_upgrade_activations || 0) > 0
                  ? `<span class="ma-badge ma-badge--warn">${r.pending_upgrade_activations} pending</span>`
                  : `<span class="muted">${r.upgrade_payment_count || 0} paid</span>`}
              </td>
              <td>${escapeHtml(r.gstin || '—')}</td>
              <td><button class="btn btn-primary btn-sm" type="button" data-open-profile="${r.id}">Manage</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p class="muted">No restaurants found.</p>';

    root.querySelectorAll('[data-open-profile]').forEach((btn) => {
      btn.addEventListener('click', () => openRestaurantProfile(Number(btn.dataset.openProfile)));
    });
  }

  async function openRestaurantProfile(restaurantId) {
    state.profileRestaurantId = restaurantId;
    state.profileTab = 'overview';
    const data = await apiRequest(`/api/master-admin/restaurants/${restaurantId}/profile`, {}, true);
    state.profileData = data;
    await loadFeatureRegistry();
    renderRestaurantProfile();
    const modal = el('restaurantProfileModal');
    modal?.classList.remove('hidden');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeRestaurantProfile() {
    el('restaurantProfileModal')?.classList.add('hidden');
    el('restaurantProfileModal')?.setAttribute('aria-hidden', 'true');
    state.profileRestaurantId = null;
    state.profileData = null;
  }

  function setProfileTab(tab) {
    state.profileTab = tab;
    document.querySelectorAll('[data-profile-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.profileTab === tab);
    });
    document.querySelectorAll('[data-profile-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.profilePanel !== tab);
    });
    renderRestaurantProfile();
  }

  function renderRestaurantProfile() {
    const data = state.profileData;
    if (!data) return;
    const r = data.restaurant || {};
    el('profileRestaurantName').textContent = r.name || 'Restaurant';
    el('profileRestaurantMeta').textContent = [
      data.owner?.email,
      r.phone,
      r.onboarding_status,
    ].filter(Boolean).join(' · ');

    if (state.profileTab === 'overview') renderProfileOverview(data);
    if (state.profileTab === 'features') renderProfileFeatures(data);
    if (state.profileTab === 'financial') renderProfileFinancial(data);
    if (state.profileTab === 'upgrades') renderProfileUpgrades(data);
    if (state.profileTab === 'payouts') renderProfilePayouts(data);
  }

  function renderProfileOverview(data) {
    const s = data.stats || {};
    const r = data.restaurant || {};
    el('profileTabOverview').innerHTML = `
      <div class="summary-grid summary-grid--compact">
        <div class="summary-card"><p>Total revenue</p><strong>${formatMoney(s.totalRevenue)}</strong></div>
        <div class="summary-card"><p>Paid orders</p><strong>${s.paidOrders || 0}</strong></div>
        <div class="summary-card"><p>AutoResto commission</p><strong>${formatMoney(s.totalCommission)}</strong></div>
        <div class="summary-card"><p>Net to restaurant</p><strong>${formatMoney(s.netToRestaurant)}</strong></div>
      </div>
      <article class="panel ma-hover-card" style="margin-top:1rem;">
        <h4>Restaurant details</h4>
        <div class="ma-kv-grid">
          <div><span>Legal name</span><strong>${escapeHtml(r.legal_name || '—')}</strong></div>
          <div><span>GSTIN</span><strong>${escapeHtml(r.gstin || '—')}</strong></div>
          <div><span>Subscription</span><strong>${escapeHtml(r.subscription_plan || '—')} (${escapeHtml(r.subscription_status || '—')})</strong></div>
          <div><span>Owner</span><strong>${escapeHtml(data.owner?.name || '—')} · ${escapeHtml(data.owner?.email || '')}</strong></div>
          <div><span>UPI</span><strong>${escapeHtml(r.upi_vpa || '—')}</strong></div>
          <div><span>Pending settlements</span><strong>${s.pendingSettlements || 0}</strong></div>
        </div>
      </article>
    `;
  }

  function renderProfileFeatures(data) {
    const features = data.features || [];
    el('profileTabFeatures').innerHTML = `
      <p class="muted">Toggle features for this restaurant. Changes apply immediately.</p>
      <div class="ma-feature-grid">
        ${features.map((f) => `
          <label class="ma-feature-toggle">
            <input type="checkbox" data-feature-toggle="${escapeHtml(f.feature_key)}" ${f.enabled ? 'checked' : ''} />
            <span>
              <strong>${escapeHtml(f.name || f.feature_key)}</strong>
              <small>${escapeHtml(f.feature_key)}</small>
            </span>
          </label>
        `).join('')}
      </div>
    `;

    el('profileTabFeatures').querySelectorAll('[data-feature-toggle]').forEach((input) => {
      input.addEventListener('change', async () => {
        const featureKey = input.dataset.featureToggle;
        try {
          const result = await apiRequest(
            `/api/master-admin/restaurants/${state.profileRestaurantId}/features/${featureKey}`,
            { method: 'POST', body: JSON.stringify({ enabled: input.checked }) },
            true
          );
          state.profileData.features = result.features || state.profileData.features;
          setMessage(`Feature ${featureKey} ${input.checked ? 'enabled' : 'disabled'}.`);
        } catch (error) {
          input.checked = !input.checked;
          setMessage(error.message, true);
        }
      });
    });
  }

  function renderProfileFinancial(data) {
    const r = data.restaurant || {};
    const bank = (data.bankAccounts || [])[0] || {};
    el('profileTabFinancial').innerHTML = `
      <p class="muted">Bank, GST, and payout details used for Cashfree settlements and tax invoices.</p>
      <form id="profileFinancialForm" class="admin-form ma-financial-form">
        <fieldset><legend>GST &amp; legal</legend>
          <input name="legalName" placeholder="Legal business name" value="${escapeHtml(r.legal_name || '')}" />
          <input name="gstin" placeholder="GSTIN" maxlength="15" value="${escapeHtml(r.gstin || '')}" />
          <input name="fssaiLicense" placeholder="FSSAI license" value="${escapeHtml(r.fssai_license || '')}" />
          <input name="stateName" placeholder="State" value="${escapeHtml(r.state_name || '')}" />
          <input name="stateCode" placeholder="State code" value="${escapeHtml(r.state_code || '')}" />
          <input name="defaultGstRate" type="number" step="0.01" placeholder="Default GST %" value="${escapeHtml(r.default_gst_rate ?? '')}" />
          <input name="invoicePrefix" placeholder="Invoice prefix" value="${escapeHtml(r.invoice_prefix || '')}" />
          <textarea name="businessAddress" placeholder="Business address" rows="2">${escapeHtml(r.business_address || r.address || '')}</textarea>
        </fieldset>
        <fieldset><legend>Bank &amp; UPI (for payouts)</legend>
          <input name="accountHolderName" placeholder="Account holder name" value="${escapeHtml(bank.account_holder_name || r.bank_account_name || '')}" />
          <input name="bankName" placeholder="Bank name" value="${escapeHtml(bank.bank_name || r.bank_name || '')}" />
          <input name="accountNumber" placeholder="Account number (enter to update)" autocomplete="off" />
          <input name="ifscCode" placeholder="IFSC code" value="${escapeHtml(bank.ifsc_code || '')}" />
          <input name="upiVpa" placeholder="UPI VPA" value="${escapeHtml(r.upi_vpa || bank.upi_id || '')}" />
          <p class="muted">Current account: ${escapeHtml(bank.account_masked || 'Not on file')}</p>
        </fieldset>
        <fieldset><legend>Contact</legend>
          <input name="phone" placeholder="Phone" value="${escapeHtml(r.phone || '')}" />
          <input name="address" placeholder="Address" value="${escapeHtml(r.address || '')}" />
        </fieldset>
        <button class="btn btn-primary" type="submit">Save financial details</button>
      </form>
    `;

    el('profileFinancialForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const body = Object.fromEntries(formData.entries());
      try {
        const result = await apiRequest(
          `/api/master-admin/restaurants/${state.profileRestaurantId}/financial`,
          { method: 'PATCH', body: JSON.stringify(body) },
          true
        );
        state.profileData = result.profile || state.profileData;
        renderProfileFinancial(state.profileData);
        setMessage('Financial details saved.');
      } catch (error) {
        setMessage(error.message, true);
      }
    }, { once: true });
  }

  function renderProfileUpgrades(data) {
    const payments = data.upgradePayments || [];
    el('profileTabUpgrades').innerHTML = `
      <table class="ma-data-table">
        <thead><tr><th>Date</th><th>Amount</th><th>Purpose</th><th>Cashfree ID</th><th>Status</th><th>Activation</th></tr></thead>
        <tbody>
          ${payments.map((p) => `
            <tr>
              <td>${formatDate(p.created_at)}</td>
              <td>${formatMoney(p.amount)}</td>
              <td>${escapeHtml(p.payment_purpose || '—')}</td>
              <td><small>${escapeHtml(p.provider_order_id || p.provider_payment_id || '—')}</small></td>
              <td>${statusBadge(p.status === 'paid', 'Paid', p.status || '—')}</td>
              <td>${escapeHtml(p.activation_status || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p class="muted">No upgrade payments yet.</p>';
  }

  function renderProfilePayouts(data) {
    const s = data.stats || {};
    el('profileTabPayouts').innerHTML = `
      <div class="summary-grid summary-grid--compact">
        <div class="summary-card"><p>Gross collected</p><strong>${formatMoney(s.totalRevenue)}</strong></div>
        <div class="summary-card"><p>Platform commission</p><strong>${formatMoney(s.totalCommission)}</strong></div>
        <div class="summary-card"><p>Restaurant net</p><strong>${formatMoney(s.netToRestaurant)}</strong></div>
        <div class="summary-card"><p>Pending settlements</p><strong>${s.pendingSettlements || 0}</strong></div>
      </div>
      <p class="muted" style="margin-top:1rem;">Use the Settlements section to record Cashfree payout batches to this restaurant.</p>
      <button class="btn btn-light" type="button" id="profileOpenSettlements">Open settlements</button>
    `;
    el('profileOpenSettlements')?.addEventListener('click', () => {
      closeRestaurantProfile();
      setSection('settlements');
    });
  }

  async function loadUpgradeQueue() {
    const data = await apiRequest(
      `/api/master-admin/upgrade-queue?status=${encodeURIComponent(state.upgradeStatus)}`,
      {},
      true
    );
    await loadFeatureRegistry();
    renderUpgradeQueue(data.queue || []);
  }

  function renderUpgradeQueue(queue) {
    const root = el('upgradeQueueTable');
    if (!root) return;
    root.innerHTML = `
      <table class="ma-data-table">
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Owner</th>
            <th>Amount</th>
            <th>Cashfree ref</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${queue.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.restaurant_name)}</strong></td>
              <td>${escapeHtml(item.owner_email || '—')}</td>
              <td>${formatMoney(item.amount)}</td>
              <td><small>${escapeHtml(item.provider_order_id || '—')}</small></td>
              <td>${formatDate(item.created_at)}</td>
              <td><span class="ma-badge ma-badge--${item.status === 'pending' ? 'warn' : item.status === 'activated' ? 'success' : 'muted'}">${escapeHtml(item.status)}</span></td>
              <td class="ma-actions-cell">
                ${item.status === 'pending' ? `
                  <button class="btn btn-primary btn-sm" type="button" data-activate-upgrade="${item.id}">Activate</button>
                  <button class="btn btn-light btn-sm" type="button" data-reject-upgrade="${item.id}">Reject</button>
                  <button class="btn btn-light btn-sm" type="button" data-manage-restaurant="${item.restaurant_id}">Manage</button>
                ` : `<button class="btn btn-light btn-sm" type="button" data-manage-restaurant="${item.restaurant_id}">Manage</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p class="muted">No items in this queue.</p>';

    root.querySelectorAll('[data-activate-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => activateUpgrade(Number(btn.dataset.activateUpgrade)));
    });
    root.querySelectorAll('[data-reject-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => rejectUpgrade(Number(btn.dataset.rejectUpgrade)));
    });
    root.querySelectorAll('[data-manage-restaurant]').forEach((btn) => {
      btn.addEventListener('click', () => openRestaurantProfile(Number(btn.dataset.manageRestaurant)));
    });
  }

  async function activateUpgrade(id) {
    const featureKeys = state.featureRegistry.map((f) => f.feature_key);
    const selected = prompt(
      'Enter feature keys to enable (comma-separated), or leave blank to mark paid only:',
      featureKeys.slice(0, 5).join(', ')
    );
    const keys = selected ? selected.split(',').map((k) => k.trim()).filter(Boolean) : [];
    try {
      await apiRequest(`/api/master-admin/upgrade-activations/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ featureKeys: keys }),
      }, true);
      setMessage('Upgrade activated and features enabled.');
      await loadUpgradeQueue();
      await loadRestaurantHub();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function rejectUpgrade(id) {
    const notes = prompt('Reason for rejection (optional):') || '';
    try {
      await apiRequest(`/api/master-admin/upgrade-activations/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }, true);
      setMessage('Upgrade marked as rejected.');
      await loadUpgradeQueue();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function loadSupportTickets() {
    if (!state.hubRestaurants.length) {
      try {
        const hub = await apiRequest('/api/master-admin/restaurants', {}, true);
        state.hubRestaurants = hub.restaurants || [];
      } catch (_) { /* dashboard list fallback in populate */ }
    }
    const status = state.supportStatus;
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await apiRequest(`/api/master-admin/support-tickets${query}`, {}, true);
    renderSupportTicketsTable(data.tickets || []);
    populateSupportRestaurantSelect();
  }

  function populateSupportRestaurantSelect() {
    const select = el('supportRestaurantSelect');
    if (!select || select.options.length > 1) return;
    const restaurants = state.hubRestaurants.length
      ? state.hubRestaurants
      : (getDashboard().restaurants || []);
    select.innerHTML = '<option value="">No restaurant (platform)</option>' + restaurants.map((r) => (
      `<option value="${r.id}">${escapeHtml(r.name)}</option>`
    )).join('');
  }

  function renderSupportTicketsTable(tickets) {
    const root = el('supportTicketsTable');
    if (!root) return;
    root.innerHTML = `
      <table class="ma-data-table">
        <thead><tr>
          <th>ID</th><th>Subject</th><th>Restaurant</th><th>Priority</th><th>Status</th><th>Created</th><th></th>
        </tr></thead>
        <tbody>
          ${tickets.map((t) => `
            <tr>
              <td>#${t.id}</td>
              <td>${escapeHtml(t.subject)}</td>
              <td>${escapeHtml(t.restaurant_name || 'Platform')}</td>
              <td><span class="ma-badge ma-badge--${t.priority === 'urgent' ? 'warn' : 'muted'}">${escapeHtml(t.priority)}</span></td>
              <td>${escapeHtml(t.status)}</td>
              <td>${formatDateShort(t.created_at)}</td>
              <td><button class="btn btn-light btn-sm" type="button" data-view-ticket="${t.id}">View</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p class="muted">No tickets yet.</p>';

    root.querySelectorAll('[data-view-ticket]').forEach((btn) => {
      btn.addEventListener('click', () => openSupportTicket(Number(btn.dataset.viewTicket)));
    });
  }

  async function openSupportTicket(id) {
    state.selectedTicketId = id;
    const data = await apiRequest(`/api/master-admin/support-tickets/${id}`, {}, true);
    const t = data.ticket;
    const detail = el('supportTicketDetail');
    const replyForm = el('supportReplyForm');
    const hint = el('supportDetailHint');
    if (hint) hint.textContent = `Ticket #${t.id}`;
    if (!detail) return;

    const allMessages = [
      ...(data.messages || []).map((m) => ({ ...m, internal: false })),
      ...(data.internalNotes || []).map((m) => ({ ...m, internal: true })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    detail.innerHTML = `
      <div class="ma-kv-grid" style="margin-bottom:0.75rem;">
        <div><span>Status</span><strong>${escapeHtml(t.status)}</strong></div>
        <div><span>Priority</span><strong>${escapeHtml(t.priority)}</strong></div>
        <div><span>Category</span><strong>${escapeHtml(t.category)}</strong></div>
        <div><span>From</span><strong>${escapeHtml(t.created_by_name || t.created_by_email || '—')}</strong></div>
      </div>
      <div class="admin-toolbar" style="margin-bottom:0.75rem;">
        <select id="supportStatusSelect">
          <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In progress</option>
          <option value="waiting_customer" ${t.status === 'waiting_customer' ? 'selected' : ''}>Waiting customer</option>
          <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
        </select>
        <button class="btn btn-light" type="button" id="supportUpdateStatusBtn">Update status</button>
      </div>
      <div class="ma-thread">
        ${allMessages.map((m) => `
          <div class="ma-thread-item${m.internal ? ' ma-thread-item--internal' : ''}">
            <strong>${escapeHtml(m.author_name || m.author_role || 'User')}${m.internal ? ' (internal)' : ''}</strong>
            <p>${escapeHtml(m.message)}</p>
            <small>${formatDate(m.created_at)}</small>
          </div>
        `).join('') || '<p class="muted">No messages yet.</p>'}
      </div>
    `;

    replyForm?.classList.remove('hidden');
    el('supportUpdateStatusBtn')?.addEventListener('click', async () => {
      const status = el('supportStatusSelect')?.value;
      try {
        await apiRequest(`/api/master-admin/support-tickets/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }, true);
        setMessage('Ticket status updated.');
        await openSupportTicket(id);
        await loadSupportTickets();
      } catch (error) {
        setMessage(error.message, true);
      }
    });
  }

  async function handleSupportCreate(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      await apiRequest('/api/master-admin/support-tickets', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: formData.get('restaurantId') || null,
          subject: formData.get('subject'),
          category: formData.get('category'),
          priority: formData.get('priority'),
          description: formData.get('description'),
        }),
      }, true);
      event.target.reset();
      setMessage('Support ticket created.');
      await loadSupportTickets();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function handleSupportReply(event) {
    event.preventDefault();
    if (!state.selectedTicketId) return;
    const formData = new FormData(event.target);
    try {
      await apiRequest(`/api/master-admin/support-tickets/${state.selectedTicketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: formData.get('message'),
          isInternal: formData.get('isInternal') === 'on',
        }),
      }, true);
      event.target.reset();
      await openSupportTicket(state.selectedTicketId);
      setMessage('Reply sent.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function handleExportClick(exportType) {
    const map = {
      orders: ['orders', 'orders_export.csv'],
      reconciliation: ['reconciliation', 'reconciliation_export.csv'],
      settlements: ['settlements', 'settlements_export.csv'],
      restaurants: ['restaurants', 'restaurants_export.csv'],
      'upgrade-queue': ['upgrade-queue', 'upgrade_queue_export.csv'],
      'support-tickets': ['support-tickets', 'support_tickets_export.csv'],
    };
    const [path, filename] = map[exportType] || [];
    if (!path) return;
    try {
      await downloadExport(`/api/master-admin/exports/${path}`, filename);
      setMessage('Export downloaded.');
    } catch (error) {
      setMessage(error.message, true);
    }
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
      await loadMasterMetrics('30d');
      await loadSaasProfits();
      toggleAdMediaFields();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  init();
})();
