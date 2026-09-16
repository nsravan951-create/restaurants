let restaurantId = null;
let latestOrders = [];
let restaurantProfile = null;
let menuItemsCache = [];
let menuCategoriesCache = [];
let activeBillOrder = null;
let activeBillTableId = null;
let ownerEntitlements = new Map();
let ownerSubscription = null;
let ownerPlans = [];
let activeNavSection = 'dashboard';
let latestTablesCache = [];
let ownerNavLayout = null;

const OWNER_NAV = [
  { group: 'Overview', section: 'dashboard', label: 'Dashboard', icon: 'grid', featureKey: null },
  { group: 'Operations', section: 'kitchen', label: 'Kitchen', icon: 'flame', featureKey: 'kitchen' },
  { group: 'Operations', section: 'ready', label: 'Ready Orders', icon: 'check', featureKey: 'orders' },
  { group: 'Operations', section: 'tables', label: 'Tables & QR', icon: 'qr', featureKey: 'qr_ordering' },
  { group: 'Operations', section: 'menu', label: 'Menu', icon: 'menu', featureKey: 'basic_menu' },
  { group: 'Operations', section: 'invoices', label: 'Invoices', icon: 'invoice', featureKey: 'billing' },
  { group: 'Growth', section: 'analytics', label: 'Analytics', icon: 'chart', featureKey: null },
  { group: 'Growth', section: 'reviews', label: 'Reviews', icon: 'star', featureKey: null },
  { group: 'Growth', section: 'inventory', label: 'Inventory', icon: 'box', featureKey: 'inventory', premium: true },
  { group: 'Growth', section: 'offers', label: 'Offers', icon: 'tag', featureKey: 'offers', premium: true },
  { group: 'Growth', section: 'coupons', label: 'Coupons', icon: 'ticket', featureKey: 'coupons', premium: true },
  { group: 'Growth', section: 'customers', label: 'Customers', icon: 'users', featureKey: 'customer_management', premium: true },
  { group: 'Growth', section: 'loyalty', label: 'Loyalty', icon: 'heart', featureKey: 'loyalty', premium: true },
  { group: 'Growth', section: 'advanced-analytics', label: 'Advanced Analytics', icon: 'chart', featureKey: 'advanced_analytics', premium: true },
  { group: 'Settings', section: 'gst', label: 'GST & Invoice', icon: 'settings', featureKey: null },
  { group: 'Settings', section: 'password', label: 'Password', icon: 'lock', featureKey: null },
  { group: 'Settings', section: 'features', label: 'Plans & Upgrade', icon: 'sparkles', featureKey: null },
];

const SECTION_META = {
  dashboard: { title: 'Dashboard', description: 'Live overview of orders, revenue, and table status.', action: null },
  kitchen: { title: 'Kitchen Board', description: 'Pending and preparing orders.', action: null },
  ready: { title: 'Ready Orders', description: 'Orders ready for delivery.', action: null },
  tables: { title: 'Tables & QR', description: 'Manage table boxes, QR codes, and payment details.', action: { label: 'Generate QR Codes', form: 'autoTableForm' } },
  menu: { title: 'Menu', description: 'Add, edit, or remove food items.', action: null },
  invoices: { title: 'Invoices', description: 'Browse synced invoices and receipts.', action: { label: 'Refresh', id: 'refreshInvoicesBtn' } },
  analytics: { title: 'Analytics', description: 'Revenue, order volume, and popular items.', action: null },
  reviews: { title: 'Reviews', description: 'Customer ratings after payment.', action: null },
  gst: { title: 'GST & Invoice Settings', description: 'Legal billing details for tax invoices.', action: null },
  password: { title: 'Password', description: 'Update your owner dashboard password.', action: null },
  features: { title: 'Plans & Upgrade', description: 'See enabled features and upgrade options.', action: { label: 'View Upgrade', id: 'openUpgradeFromFeatures' } },
  inventory: { title: 'Inventory', description: 'Track stock levels and low-stock alerts.', premium: true },
  offers: { title: 'Offers', description: 'Create promotional offers for guests.', premium: true },
  coupons: { title: 'Coupons', description: 'Discount codes and campaign management.', premium: true },
  customers: { title: 'Customers', description: 'Guest profiles and order history.', premium: true },
  loyalty: { title: 'Loyalty', description: 'Reward repeat customers.', premium: true },
  'advanced-analytics': { title: 'Advanced Analytics', description: 'Deeper revenue and performance insights.', premium: true },
};

const NAV_ICONS = {
  grid: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  flame: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3c2 4 5 5 5 9a5 5 0 1 1-10 0c0-4 3-5 5-9z"/></svg>',
  check: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  qr: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>',
  menu: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  invoice: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z"/></svg>',
  chart: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5M4 19h16M8 17V9M12 17V7M16 17v-4"/></svg>',
  star: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>',
  box: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22 2 7l10-5 10 5-10 15z"/><path d="M2 7l10 5 10-5M12 12v10"/></svg>',
  tag: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12 12 20 4 12V4h8z"/><circle cx="9" cy="9" r="1.5"/></svg>',
  ticket: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9a2 2 0 0 1 0-4h16a2 2 0 0 1 0 4M4 15a2 2 0 0 0 0 4h16a2 2 0 0 0 0-4"/><path d="M9 5v14"/></svg>',
  users: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3 4-3"/></svg>',
  heart: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"/></svg>',
  settings: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lock: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  sparkles: '<svg class="owner-nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1z"/></svg>',
};

function promoDismissKey() {
  return restaurantId ? `owner_promo_dismiss_${restaurantId}` : 'owner_promo_dismiss';
}

function isFeatureEnabled(featureKey) {
  if (!featureKey) return true;
  return ownerEntitlements.get(featureKey) === true;
}

function getLockedFeatureCount() {
  return (Array.from(ownerEntitlements.entries()).filter(([, enabled]) => !enabled)).length;
}

function getUpgradePlan() {
  const paid = ownerPlans.filter((plan) => Number(plan.price) > 0);
  if (paid.length) return paid[paid.length - 1];
  return ownerPlans.find((plan) => plan.code !== 'starter') || null;
}

function getOrderedOwnerNav() {
  if (!ownerNavLayout || !Array.isArray(ownerNavLayout)) return OWNER_NAV;
  const map = new Map(OWNER_NAV.map((item) => [item.section, item]));
  const ordered = [];
  for (const section of ownerNavLayout) {
    if (map.has(section)) ordered.push(map.get(section));
  }
  for (const item of OWNER_NAV) {
    if (!ownerNavLayout.includes(item.section)) ordered.push(item);
  }
  return ordered;
}

async function loadDashboardLayout() {
  try {
    const data = await apiRequest('/owner/dashboard-layout', {}, true);
    ownerNavLayout = data.sections || null;
  } catch (_) {
    ownerNavLayout = null;
  }
}

function renderLayoutCustomizer() {
  const root = document.getElementById('ownerLayoutList');
  if (!root) return;
  const nav = getOrderedOwnerNav();
  root.innerHTML = nav.map((item, index) => `
    <div class="od-layout-row" data-layout-section="${item.section}">
      <span class="od-layout-row__pos">${index + 1}</span>
      <span class="od-layout-row__label">${escapeHtml(item.label)}</span>
      <span class="od-layout-row__group">${escapeHtml(item.group)}</span>
      <div class="od-layout-row__actions">
        <button type="button" class="btn btn-light btn-sm" data-layout-up="${item.section}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-light btn-sm" data-layout-down="${item.section}" ${index === nav.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>
  `).join('');

  root.querySelectorAll('[data-layout-up]').forEach((btn) => {
    btn.addEventListener('click', () => moveLayoutSection(btn.dataset.layoutUp, -1));
  });
  root.querySelectorAll('[data-layout-down]').forEach((btn) => {
    btn.addEventListener('click', () => moveLayoutSection(btn.dataset.layoutDown, 1));
  });
}

function moveLayoutSection(section, direction) {
  const current = getOrderedOwnerNav().map((item) => item.section);
  const index = current.indexOf(section);
  if (index < 0) return;
  const target = index + direction;
  if (target < 0 || target >= current.length) return;
  [current[index], current[target]] = [current[target], current[index]];
  ownerNavLayout = current;
  renderLayoutCustomizer();
  buildOwnerSidebar();
}

async function saveDashboardLayout() {
  const sections = getOrderedOwnerNav().map((item) => item.section);
  await apiRequest('/owner/dashboard-layout', {
    method: 'PATCH',
    body: JSON.stringify({ sections }),
  }, true);
  ownerNavLayout = sections;
  setMessage('ownerMessage', 'Dashboard order saved.');
}

function buildOwnerSidebar() {
  const nav = document.getElementById('ownerNav');
  if (!nav) return;

  let html = '';
  let lastGroup = '';
  getOrderedOwnerNav().forEach((item) => {
    if (item.group !== lastGroup) {
      html += `<p class="owner-sidebar__group-label">${escapeHtml(item.group)}</p>`;
      lastGroup = item.group;
    }
    const locked = item.featureKey && !isFeatureEnabled(item.featureKey);
    html += `
      <button class="owner-nav-item${activeNavSection === item.section ? ' active' : ''}" type="button"
        data-owner-section="${item.section}" data-feature-key="${item.featureKey || ''}" data-locked="${locked ? '1' : '0'}">
        ${NAV_ICONS[item.icon] || ''}
        <span>${escapeHtml(item.label)}</span>
        ${locked ? '<span class="owner-nav-item__lock">Premium</span>' : ''}
      </button>
    `;
  });
  nav.innerHTML = html;

  nav.querySelectorAll('[data-owner-section]').forEach((button) => {
    button.addEventListener('click', async () => {
      closeSidebarDrawer();
      try {
        await activateSection(button.dataset.ownerSection);
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });
}

function updatePageHeader(sectionName) {
  const meta = SECTION_META[sectionName] || { title: 'Dashboard', description: '' };
  const titleEl = document.getElementById('ownerPageTitle');
  const descEl = document.getElementById('ownerPageDescription');
  const actionsEl = document.getElementById('ownerPageActions');
  if (titleEl) titleEl.textContent = meta.title;
  if (descEl) descEl.textContent = meta.description;
  if (!actionsEl) return;

  actionsEl.innerHTML = '';
  if (meta.action?.id) {
    const existing = document.getElementById(meta.action.id);
    if (existing) {
      const clone = existing.cloneNode(true);
      clone.removeAttribute('id');
      actionsEl.appendChild(clone);
      clone.addEventListener('click', () => existing.click());
    }
  } else if (meta.action?.label === 'View Upgrade') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.type = 'button';
    btn.textContent = meta.action.label;
    btn.addEventListener('click', openUpgradeModal);
    actionsEl.appendChild(btn);
  }
}

function showUpgradeGate(sectionName) {
  const meta = SECTION_META[sectionName] || { title: 'Premium feature', description: '' };
  document.getElementById('upgradeGateTitle').textContent = meta.title;
  document.getElementById('upgradeGateText').textContent = `${meta.description} Upgrade your AutoResto plan to unlock this feature.`;
  setActiveSection('upgrade-gate');
}

function openSidebarDrawer() {
  document.getElementById('ownerSidebar')?.classList.add('is-open');
  document.getElementById('sidebarOverlay')?.classList.add('is-visible');
}

function closeSidebarDrawer() {
  document.getElementById('ownerSidebar')?.classList.remove('is-open');
  document.getElementById('sidebarOverlay')?.classList.remove('is-visible');
}

async function loadEntitlements() {
  try {
    const data = await apiRequest('/owner/entitlements', {}, true);
    ownerEntitlements = new Map((data.features || []).map((row) => [row.feature_key, Boolean(row.enabled)]));
  } catch (error) {
    if (handleOwnerApiError(error, 'Unable to load entitlements')) return;
    ownerEntitlements = new Map();
  }
}

async function loadSubscriptionData() {
  try {
    const [plansData, subData] = await Promise.all([
      apiRequest('/api/subscriptions/plans', {}, true),
      apiRequest('/api/subscriptions/me', {}, true),
    ]);
    ownerPlans = plansData.plans || [];
    ownerSubscription = subData.subscription || null;
  } catch (error) {
    ownerPlans = [];
    ownerSubscription = null;
  }
}

function renderDashboardOverview() {
  const orders = latestOrders || [];
  const pending = orders.filter((o) => ['pending', 'preparing'].includes(o.status)).length;
  const ready = orders.filter((o) => o.status === 'ready').length;
  const completed = orders.filter((o) => ['delivered', 'completed'].includes(o.status)).length;
  const revenue = orders
    .filter((o) => String(o.payment_status || '').toLowerCase() === 'paid')
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const avg = orders.length ? revenue / orders.length : 0;

  const widgets = document.getElementById('dashboardWidgets');
  if (widgets) {
    widgets.innerHTML = `
      <div class="od-widget"><strong>${pending}</strong><span>New / Preparing</span></div>
      <div class="od-widget"><strong>${ready}</strong><span>Ready</span></div>
      <div class="od-widget"><strong>${completed}</strong><span>Completed</span></div>
      <div class="od-widget"><strong>INR ${formatCurrency(revenue)}</strong><span>Revenue</span></div>
      <div class="od-widget"><strong>${orders.length}</strong><span>Total Orders</span></div>
      <div class="od-widget"><strong>INR ${formatCurrency(avg)}</strong><span>Avg Order Value</span></div>
      <div class="od-widget"><strong>${latestTablesCache.filter((t) => hasRunningBill(t)).length}</strong><span>Running Bills</span></div>
      <div class="od-widget"><strong>${latestTablesCache.filter((t) => String(t.availability_status) === 'paid').length}</strong><span>Paid Tables</span></div>
    `;
  }

  const recentRoot = document.getElementById('dashboardRecentOrders');
  if (recentRoot) {
    recentRoot.innerHTML = orders.slice(0, 5).map((order) => `
      <div class="analytics-item">
        <strong>Order #${order.id} · Table ${escapeHtml(order.table_number || '')}</strong>
        <p>${escapeHtml(order.status || 'unknown')} · INR ${formatCurrency(order.total_amount)}</p>
      </div>
    `).join('') || '<p>No orders yet.</p>';
  }

  const tableRoot = document.getElementById('dashboardTableSummary');
  if (tableRoot) {
    const available = latestTablesCache.filter((t) => String(t.availability_status) === 'available' && !hasRunningBill(t)).length;
    const active = latestTablesCache.filter((t) => hasRunningBill(t) || String(t.availability_status) === 'active').length;
    const paid = latestTablesCache.filter((t) => String(t.availability_status) === 'paid').length;
    tableRoot.innerHTML = `
      <div class="analytics-item"><strong>${available}</strong><p>Available tables</p></div>
      <div class="analytics-item"><strong>${active}</strong><p>Active / running</p></div>
      <div class="analytics-item"><strong>${paid}</strong><p>Paid tables</p></div>
    `;
  }
}

async function loadDashboard() {
  if (!ensureRestaurantId()) return;
  renderDashboardOverview();
}

function buildPromotionContent(trigger = 'manual') {
  const lockedCount = getLockedFeatureCount();
  const plan = getUpgradePlan();
  const offerPrice = plan ? Number(plan.price) : 3999;
  const originalPrice = plan?.code === 'growth' ? offerPrice * 1.2 : offerPrice;
  return {
    title: trigger === 'transaction' ? '✨ Unlock more features' : '✨ Upgrade AutoResto',
    body: lockedCount
      ? `Unlock ${lockedCount} premium feature${lockedCount === 1 ? '' : 's'} for your restaurant.`
      : 'Explore premium tools to grow your restaurant.',
    offerPrice,
    originalPrice: originalPrice > offerPrice ? originalPrice : null,
    cta: 'View Upgrade',
  };
}

function showFloatingPromo(trigger = 'manual') {
  if (sessionStorage.getItem(promoDismissKey()) === '1') return;
  const promo = buildPromotionContent(trigger);
  const card = document.getElementById('floatingPromo');
  if (!card) return;
  document.getElementById('floatingPromoTitle').textContent = promo.title;
  document.getElementById('floatingPromoBody').textContent = promo.body;
  const priceEl = document.getElementById('floatingPromoPrice');
  if (priceEl) {
    priceEl.innerHTML = promo.originalPrice
      ? `<del>INR ${formatCurrency(promo.originalPrice)}</del><strong>INR ${formatCurrency(promo.offerPrice)}/month</strong>`
      : `<strong>INR ${formatCurrency(promo.offerPrice)}/month</strong>`;
  }
  card.classList.remove('hidden');
}

function hideFloatingPromo(dismiss = false) {
  document.getElementById('floatingPromo')?.classList.add('hidden');
  if (dismiss) {
    try { sessionStorage.setItem(promoDismissKey(), '1'); } catch (error) {}
  }
}

function openUpgradeModal() {
  const modal = document.getElementById('upgradeModal');
  if (!modal) return;
  renderUpgradeModal();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bill-modal-open');
}

function closeUpgradeModal() {
  const modal = document.getElementById('upgradeModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bill-modal-open');
}

function renderUpgradeModal() {
  const currentRoot = document.getElementById('upgradeCurrentPlan');
  const grid = document.getElementById('upgradePlanGrid');
  const note = document.getElementById('upgradePaymentNote');
  if (!currentRoot || !grid || !note) return;

  const currentName = ownerSubscription?.plan_name
    || restaurantProfile?.subscription_plan
    || 'Starter';
  const enabledFeatures = Array.from(ownerEntitlements.entries())
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.replace(/_/g, ' '));

  currentRoot.innerHTML = `
    <div class="panel soft-panel" style="margin:0 1.25rem;">
      <strong>Current plan: ${escapeHtml(currentName)}</strong>
      <p style="margin:0.35rem 0 0;color:var(--muted);font-size:0.9rem;">
        Enabled: ${enabledFeatures.length ? enabledFeatures.join(', ') : 'Core ordering features'}
      </p>
    </div>
  `;

  const upgradePlan = getUpgradePlan();
  if (!upgradePlan || Number(upgradePlan.price) <= 0) {
    grid.innerHTML = `
      <div class="od-plan-card od-plan-card--highlight">
        <h3 style="margin:0 0 0.35rem;font-family:'Fraunces',serif;">Growth</h3>
        <p style="margin:0;color:var(--muted);">₹3999/month</p>
        <ul>
          <li>Advanced Analytics</li>
          <li>Inventory</li>
          <li>Offers & Coupons</li>
          <li>Customer Management</li>
          <li>Loyalty</li>
        </ul>
        <button class="btn btn-primary" type="button" disabled style="margin-top:0.85rem;width:100%;">Contact AutoResto to upgrade</button>
      </div>
    `;
    note.textContent = 'Online upgrade payment is not configured yet. Cashfree upgrade flow will activate when your plan is published in AutoResto billing.';
    return;
  }

  const lockedFeatures = Array.from(ownerEntitlements.entries()).filter(([, enabled]) => !enabled);
  grid.innerHTML = ownerPlans.map((plan) => {
    const isHighlight = plan.id === upgradePlan.id;
    const features = lockedFeatures.slice(0, 5).map(([key]) => `<li>${escapeHtml(key.replace(/_/g, ' '))}</li>`).join('');
    return `
      <div class="od-plan-card${isHighlight ? ' od-plan-card--highlight' : ''}">
        <h3 style="margin:0 0 0.35rem;font-family:'Fraunces',serif;">${escapeHtml(plan.name)}</h3>
        <p style="margin:0;color:var(--muted);">INR ${formatCurrency(plan.price)}/${escapeHtml(plan.billing_interval || 'month')}</p>
        <ul>${features || '<li>All premium features</li>'}</ul>
        <button class="btn btn-primary od-upgrade-btn" type="button" data-plan-code="${escapeHtml(plan.code)}" disabled style="margin-top:0.85rem;width:100%;">
          Upgrade (admin activation)
        </button>
      </div>
    `;
  }).join('');

  note.textContent = 'Cashfree self-serve upgrade is not live yet. Your AutoResto admin can activate the selected plan securely from the control panel.';
}

function initOwnerDashboardUi() {
  document.getElementById('sidebarToggleBtn')?.addEventListener('click', openSidebarDrawer);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebarDrawer);
  document.getElementById('floatingPromoClose')?.addEventListener('click', () => hideFloatingPromo(true));
  document.getElementById('floatingPromoCta')?.addEventListener('click', openUpgradeModal);
  document.getElementById('upgradeGateCta')?.addEventListener('click', openUpgradeModal);
  document.getElementById('upgradeModalClose')?.addEventListener('click', closeUpgradeModal);
  document.getElementById('upgradeModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'upgradeModal') closeUpgradeModal();
  });
  document.getElementById('notificationsBtn')?.addEventListener('click', () => {
    setMessage('ownerMessage', 'No new notifications.');
  });
}

function ensureRestaurantId() {
  if (!restaurantId) {
    console.error('Restaurant ID missing');
    setMessage('ownerMessage', 'Restaurant ID missing', true);
    return false;
  }
  return true;
}

function redirectToOwnerLogin(message = '') {
  clearAuth();
  if (message) {
    try {
      sessionStorage.setItem('owner_auth_message', message);
    } catch (_) {}
  }
  goToPage('./auth.html');
}

function mustOwnerAuth() {
  const auth = getAuth();
  if (!auth || !auth.token || auth.user?.role !== 'owner') {
    redirectToOwnerLogin();
    return null;
  }
  return auth;
}

async function ensureOwnerSession() {
  const auth = mustOwnerAuth();
  if (!auth) return null;

  try {
    const data = await apiRequest('/api/auth/me', {}, true);
    const role = data.user?.role;
    if (role !== 'owner') {
      redirectToOwnerLogin('This page is only for restaurant owners. Please sign in with an owner account.');
      return null;
    }
    setAuth({
      ...auth,
      token: auth.token,
      user: {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      },
    });
    return getAuth();
  } catch (error) {
    if (error.authFailure || error.status === 401 || error.status === 403) {
      redirectToOwnerLogin(error.message || 'Session expired. Please sign in again.');
      return null;
    }
    throw error;
  }
}

function handleOwnerApiError(error, fallbackMessage) {
  if (error?.authFailure || error?.status === 401 || error?.status === 403) {
    redirectToOwnerLogin(error.message || 'Session expired. Please sign in again.');
    return true;
  }
  console.warn(fallbackMessage, error?.message || error);
  return false;
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
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bill-modal-open');
  const passwordInput = document.getElementById('paymentAuthPassword');
  if (passwordInput) passwordInput.focus();
}

function closePaymentAuthModal() {
  const modal = document.getElementById('paymentAuthModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('is-open');
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
  const availabilityStatus = String(table.availability_status || 'available').toLowerCase();

  if (payStatus === 'paid' || availabilityStatus === 'paid') {
    if (method === 'cash' || method === 'cod') {
      return '<span class="table-card__pay-pill table-card__pay-pill--cash">CASH</span>';
    }
    return '<span class="table-card__pay-pill table-card__pay-pill--upi">PAID</span>';
  }
  if (table.active_order_id && payStatus === 'pending') {
    return '<span class="table-card__pay-pill table-card__pay-pill--bill">BILL OPEN</span>';
  }
  return '';
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
  const logoUrl = restaurantProfile?.logo_url || restaurantProfile?.logo || null;
  const thankYouMessage = (window.APP_CONFIG?.BILL_THANK_YOU_MESSAGE || 'Thank you for visiting! Please come again.');
  document.getElementById('billOrderInfo').innerHTML = `
    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)} logo" style="max-width:120px;max-height:80px;object-fit:contain;margin-bottom:0.6rem;border-radius:10px;" />` : ''}
    <p><strong>${escapeHtml(restaurantName)}</strong></p>
    <p>${escapeHtml(order.bank_name || restaurantProfile?.bank_name || '')} ${escapeHtml(order.bank_account_name || restaurantProfile?.bank_account_name || '')}</p>
    <p style="margin-top:0.5rem;color:#6b7280;">${escapeHtml(thankYouMessage)}</p>
  `;

  document.getElementById('billItemsBody').innerHTML = items.length ? items.map((it) => `
    <tr>
      <td>${escapeHtml(it.item_name)}</td>
      <td>${it.quantity}</td>
      <td>INR ${formatCurrency(it.item_price || it.unit_price)}</td>
      <td>INR ${formatCurrency(it.line_total)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4">No items</td></tr>';

  const subtotal = items.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
  const gstPercent = Number(window.APP_CONFIG?.GST_PERCENT || 0);
  const gstAmount = subtotal * (gstPercent / 100);
  const grandTotal = subtotal + gstAmount;

  document.getElementById('billGrandTotal').textContent = `INR ${formatCurrency(grandTotal)}`;
  const grandTotalRow = document.querySelector('#billModal tfoot tr');
  if (grandTotalRow) {
    const gstRow = document.createElement('tr');
    gstRow.innerHTML = `<td colspan="3">GST ${gstPercent ? `(${gstPercent}%)` : ''}</td><td>INR ${formatCurrency(gstAmount)}</td>`;
    grandTotalRow.insertAdjacentElement('beforebegin', gstRow);
    const subtotalRow = document.createElement('tr');
    subtotalRow.innerHTML = `<td colspan="3">Subtotal</td><td>INR ${formatCurrency(subtotal)}</td>`;
    grandTotalRow.insertAdjacentElement('beforebegin', subtotalRow);
  }

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

async function printInvoiceForOrder(orderId) {
  try {
    const html = await fetchAuthorizedHtml(`/orders/${orderId}/invoice?format=html`);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      throw new Error('Popup blocked');
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        // ignore print dialog errors
      }
    }, 250);
  } catch (error) {
    console.warn('Unable to print invoice', error.message);
  }
}

async function markBillPaid(method) {
  if (!activeBillOrder) return;
  const orderId = activeBillOrder.id;
  await apiRequest(`/orders/${orderId}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  }, true);
  hideBillModal();
  setMessage('ownerMessage', 'Cash recorded — table is ready for the next guest.');
  await loadTables();
  await loadInvoices();
  await printInvoiceForOrder(orderId);
}

function setActiveSection(sectionName) {
  activeNavSection = sectionName;
  document.querySelectorAll('[data-owner-section-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.ownerSectionPanel !== sectionName);
  });

  document.querySelectorAll('.owner-nav-item[data-owner-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.ownerSection === sectionName);
  });

  updatePageHeader(sectionName);
}

async function activateSection(sectionName) {
  const navItem = getOrderedOwnerNav().find((item) => item.section === sectionName);
  if (navItem?.featureKey && !isFeatureEnabled(navItem.featureKey)) {
    showUpgradeGate(sectionName);
    return;
  }

  setActiveSection(sectionName);

  const loaders = {
    dashboard: loadDashboard,
    tables: loadTables,
    menu: loadMenu,
    analytics: loadAnalytics,
    invoices: loadInvoices,
    features: loadFeatures,
    reviews: loadReviews,
    gst: loadGstSettings,
    kitchen: loadOrders,
    ready: loadOrders,
  };

  if (loaders[sectionName]) {
    await loaders[sectionName]();
  }
}

async function loadReviews() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/api/reviews/restaurant/${restaurantId}`, {}, true);
  const reviews = data.reviews || [];
  const summaryRoot = document.getElementById('reviewsSummary');
  const listRoot = document.getElementById('reviewsList');
  if (!summaryRoot || !listRoot) return;

  const count = reviews.length;
  const average = count
    ? (reviews.reduce((sum, row) => sum + Number(row.rating || 0), 0) / count).toFixed(1)
    : '0.0';

  summaryRoot.innerHTML = `
    <div class="card"><strong>${average}</strong><p>Average rating</p></div>
    <div class="card"><strong>${count}</strong><p>Total reviews</p></div>
    <div class="card"><strong>${reviews.filter((r) => r.rating >= 4).length}</strong><p>4★ and above</p></div>
    <div class="card"><strong>${reviews.filter((r) => r.rating <= 2).length}</strong><p>Needs attention (≤2★)</p></div>
  `;

  listRoot.innerHTML = reviews.length
    ? reviews.map((review) => `
      <div class="card">
        <strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} · Order #${review.order_id}</strong>
        <p>${escapeHtml(review.comment || 'No comment')}</p>
        <p style="color:var(--muted);font-size:.85rem;">${new Date(review.created_at).toLocaleString()}</p>
      </div>
    `).join('')
    : '<p>No reviews yet. They appear after guests pay and optionally rate their meal.</p>';
}

async function loadFeatures() {
  await loadEntitlements();
  buildOwnerSidebar();
  const root = document.getElementById('ownerFeatureList');
  if (!root) return;
  root.innerHTML = (Array.from(ownerEntitlements.entries()).map(([key, enabled]) => {
    const label = key.replace(/_/g, ' ');
    return `
    <div class="card od-widget">
      <strong>${escapeHtml(enabled ? label : `Locked: ${label}`)}</strong>
      <p>${enabled ? 'Available on your plan.' : 'Upgrade to unlock this feature.'}</p>
      ${enabled ? '' : '<button class="btn btn-light" type="button" data-open-upgrade>Upgrade</button>'}
    </div>
  `;
  })).join('') || '<p>No feature entitlements configured.</p>';

  root.querySelectorAll('[data-open-upgrade]').forEach((btn) => {
    btn.addEventListener('click', openUpgradeModal);
  });
  renderLayoutCustomizer();
  loadOwnerSupportTickets().catch(() => {});
}

async function loadOwnerSupportTickets() {
  const root = document.getElementById('ownerSupportTickets');
  if (!root) return;
  try {
    const data = await apiRequest('/owner/support-tickets', {}, true);
    const tickets = data.tickets || [];
    root.innerHTML = tickets.map((t) => `
      <div class="od-widget">
        <strong>#${t.id} · ${escapeHtml(t.subject)}</strong>
        <p>${escapeHtml(t.category)} · ${escapeHtml(t.status)} · ${escapeHtml(t.priority)}</p>
        <small>${new Date(t.created_at).toLocaleString()}</small>
      </div>
    `).join('') || '<p class="hero-copy">No support tickets yet.</p>';
  } catch (_) {
    root.innerHTML = '<p class="hero-copy">Support tickets will appear here after migration 014.</p>';
  }
}

async function loadRestaurant() {
  const data = await apiRequest('/restaurants/owner/me', {}, true);
  restaurantProfile = data.restaurant;
  restaurantId = data.restaurant.id;
  document.getElementById('ownerRestaurantName').textContent = data.restaurant.name;
  const meta = document.getElementById('ownerRestaurantMeta');
  if (meta) {
    meta.textContent = `Table ordering · ${data.restaurant.subscription_plan || 'Starter'} plan`;
  }

  const payForm = document.getElementById('paymentSettingsForm');
  if (payForm) {
    payForm.bankAccountName.value = data.restaurant.bank_account_name || '';
    payForm.bankName.value = data.restaurant.bank_name || '';
    payForm.logoUrl.value = data.restaurant.logo_url || '';
    payForm.thankYouMessage.value = data.restaurant.thank_you_message || '';
    setPaymentSettingsEditable(false);
  }
}

function populateCategorySelects(selectedValue = '') {
  const options = menuCategoriesCache
    .filter((row) => row.is_active)
    .sort((a, b) => Number(a.display_order) - Number(b.display_order) || a.name.localeCompare(b.name))
    .map((row) => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`)
    .join('');

  ['menuCategorySelect', 'menuEditCategorySelect'].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = selectedValue || select.value;
    select.innerHTML = `<option value="">Select category</option>${options}`;
    if (current) select.value = current;
  });
}

async function loadMenuCategories() {
  if (!ensureRestaurantId()) return;
  const data = await apiRequest(`/menu/${restaurantId}/categories`, {}, true);
  menuCategoriesCache = data.categories || [];
  populateCategorySelects();
  renderCategoryList();
}

function renderCategoryList() {
  const root = document.getElementById('categoryList');
  if (!root) return;

  if (!menuCategoriesCache.length) {
    root.innerHTML = '<p>No categories yet. Add one above or they will be created from existing menu item categories.</p>';
    return;
  }

  const sorted = [...menuCategoriesCache].sort(
    (a, b) => Number(a.display_order) - Number(b.display_order) || a.name.localeCompare(b.name)
  );

  root.innerHTML = sorted.map((category) => `
    <div class="card" data-category-id="${category.id}">
      <div class="toolbar" style="justify-content:space-between;align-items:center;">
        <div>
          <strong>☰ ${escapeHtml(category.name)}</strong>
          <p style="margin:0.25rem 0 0;color:var(--muted);font-size:0.85rem;">
            Order ${category.display_order} · ${category.is_active ? 'Active' : 'Disabled'}
          </p>
        </div>
        <div class="toolbar">
          <button class="btn btn-light" type="button" data-category-up="${category.id}">↑</button>
          <button class="btn btn-light" type="button" data-category-down="${category.id}">↓</button>
          <button class="btn btn-light" type="button" data-category-toggle="${category.id}">
            ${category.is_active ? 'Disable' : 'Enable'}
          </button>
          <button class="btn btn-light" type="button" data-category-rename="${category.id}">Rename</button>
          <button class="btn btn-dark" type="button" data-category-delete="${category.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  root.querySelectorAll('[data-category-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const category = menuCategoriesCache.find((row) => String(row.id) === button.dataset.categoryToggle);
      if (!category) return;
      try {
        await apiRequest(`/menu/${restaurantId}/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !category.is_active }),
        }, true);
        await loadMenuCategories();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  root.querySelectorAll('[data-category-rename]').forEach((button) => {
    button.addEventListener('click', async () => {
      const category = menuCategoriesCache.find((row) => String(row.id) === button.dataset.categoryRename);
      if (!category) return;
      const nextName = window.prompt('Rename category', category.name);
      if (!nextName || nextName.trim() === category.name) return;
      try {
        await apiRequest(`/menu/${restaurantId}/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: nextName.trim() }),
        }, true);
        await Promise.all([loadMenuCategories(), loadMenu()]);
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  root.querySelectorAll('[data-category-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const categoryId = button.dataset.categoryDelete;
      if (!window.confirm('Delete this category? This only works when no menu items use it.')) return;
      try {
        await apiRequest(`/menu/${restaurantId}/categories/${categoryId}`, { method: 'DELETE' }, true);
        await loadMenuCategories();
        setMessage('ownerMessage', 'Category deleted.');
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  root.querySelectorAll('[data-category-up],[data-category-down]').forEach((button) => {
    button.addEventListener('click', async () => {
      const category = menuCategoriesCache.find((row) => String(row.id) === (button.dataset.categoryUp || button.dataset.categoryDown));
      if (!category) return;
      const delta = button.dataset.categoryUp ? -1 : 1;
      try {
        await apiRequest(`/menu/${restaurantId}/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayOrder: Number(category.display_order || 0) + delta }),
        }, true);
        await loadMenuCategories();
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });
}

async function loadMenu() {
  if (!ensureRestaurantId()) return;
  await loadMenuCategories();
  const data = await apiRequest(`/menu/${restaurantId}`, {}, true);
  const menuList = document.getElementById('menuList');
  const items = (data.menu || []).filter((item) => item.is_available !== false);
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
        const result = await apiRequest(`/menu/${button.dataset.delete}`, { method: 'DELETE' }, true);
        setMessage('ownerMessage', result.message || 'Menu item removed.');
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
      populateCategorySelects(item.category);
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
  latestTablesCache = tables;

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

async function loadGstSettings() {
  let data;
  try {
    data = await apiRequest('/owner/gst-settings', {}, true);
  } catch (error) {
    if (handleOwnerApiError(error, 'Unable to load GST settings')) return;
    throw error;
  }
  const form = document.getElementById('gstSettingsForm');
  if (!form || !data.settings) return;
  const s = data.settings;
  form.legalName.value = s.legal_name || '';
  form.gstin.value = s.gstin || '';
  form.fssaiLicense.value = s.fssai_license || '';
  form.stateName.value = s.state_name || '';
  form.stateCode.value = s.state_code || '';
  form.defaultGstRate.value = s.default_gst_rate ?? '';
  form.invoicePrefix.value = s.invoice_prefix || '';
  form.businessAddress.value = s.business_address || '';
  form.thankYouMessage.value = s.thank_you_message || '';
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
        <button class="btn btn-light" data-kot="${order.id}" type="button">Print KOT</button>
        <button class="btn btn-light" data-thermal="${order.id}" type="button">Thermal Bill</button>
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

  document.querySelectorAll('button[data-kot]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.PrintUtils.printKot(button.dataset.kot, false);
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

  document.querySelectorAll('button[data-thermal]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.PrintUtils.printThermalBill(button.dataset.thermal);
      } catch (error) {
        setMessage('ownerMessage', error.message, true);
      }
    });
  });

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

async function initSocket() {
  if (!ensureRestaurantId()) return;
  if (!window.AutoRestoSocket) {
    console.warn('[AutoResto] Socket wrapper unavailable; realtime updates disabled.');
    return;
  }

  const socket = await window.AutoRestoSocket.connect({
    auth: { token: getAuth()?.token },
  });
  if (!socket) {
    console.warn('[AutoResto] Owner realtime disabled; dashboard will use REST refresh.');
    return;
  }

  socket.emit('restaurant:join', restaurantId);

  socket.on('order:update', (payload) => {
    loadOrders().catch((error) => setMessage('ownerMessage', error.message, true));
    loadAnalytics().catch(() => {});
    if (activeNavSection === 'dashboard') {
      loadDashboard().catch(() => {});
    }

    try {
      if (payload && (payload.type === 'created' || payload.type === 'paid')) {
        loadTables().catch(() => {});
        if (payload.type === 'paid') {
          showFloatingPromo('transaction');
        }
        if (payload.type === 'created') {
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
  const auth = await ensureOwnerSession();
  if (!auth) return;

  hideBillModal();
  initOwnerDashboardUi();

  try {
    await loadRestaurant();
    await Promise.all([
      loadEntitlements(),
      loadSubscriptionData(),
      loadDashboardLayout(),
      loadMenu(),
      loadTables(),
      loadInvoices(),
    ]);
    await loadOrders();
    buildOwnerSidebar();
    setActiveSection('dashboard');
    await loadDashboard();
    await initSocket();
    if (getLockedFeatureCount() > 0) {
      setTimeout(() => showFloatingPromo('manual'), 1200);
    }
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

document.getElementById('gstSettingsForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  try {
    await apiRequest('/owner/gst-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        legalName: formData.get('legalName'),
        gstin: formData.get('gstin'),
        fssaiLicense: formData.get('fssaiLicense'),
        stateName: formData.get('stateName'),
        stateCode: formData.get('stateCode'),
        defaultGstRate: formData.get('defaultGstRate'),
        invoicePrefix: formData.get('invoicePrefix'),
        businessAddress: formData.get('businessAddress'),
        thankYouMessage: formData.get('thankYouMessage'),
      }),
    }, true);
    setMessage('ownerMessage', 'GST settings saved.');
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('categoryForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureRestaurantId()) return;
  const formData = new FormData(event.target);
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  try {
    await apiRequest(`/menu/${restaurantId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, true);
    event.target.reset();
    await loadMenuCategories();
    setMessage('ownerMessage', `Category "${name}" added.`);
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
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
  goToPage('./auth.html');
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
          bankAccountName: fd.get('bankAccountName'),
          bankName: fd.get('bankName'),
          logoUrl: fd.get('logoUrl'),
          thankYouMessage: fd.get('thankYouMessage'),
        }),
      }, true);
      await loadRestaurant();
      setMessage('ownerMessage', 'Restaurant payment details saved for administration.');
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
    await printInvoiceForOrder(activeBillOrder.id);
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('ownerSupportForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  try {
    await apiRequest('/owner/support-tickets', {
      method: 'POST',
      body: JSON.stringify({
        subject: formData.get('subject'),
        category: formData.get('category'),
        description: formData.get('description'),
      }),
    }, true);
    event.target.reset();
    setMessage('ownerMessage', 'Support ticket submitted. Our team will respond soon.');
    await loadOwnerSupportTickets();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

document.getElementById('saveLayoutBtn')?.addEventListener('click', async () => {
  try {
    await saveDashboardLayout();
  } catch (error) {
    setMessage('ownerMessage', error.message, true);
  }
});

initOwner();
