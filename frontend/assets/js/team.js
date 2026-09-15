(function () {
  const PLATFORM_ROLES = new Set([
    'finance_manager', 'restaurant_manager', 'promotions_manager',
    'user_enquiry_manager', 'database_manager', 'backend_manager', 'analytics_manager',
  ]);

  const state = { permissions: [], role: '', section: 'overview' };

  const el = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v || 0));

  function setMessage(msg, isError = false) {
    const node = el('teamMessage');
    if (!node) return;
    node.textContent = msg || '';
    node.style.color = isError ? '#ffb4b4' : '#d8ffea';
  }

  function setSection(section) {
    state.section = section;
    document.querySelectorAll('.admin-section').forEach((n) => n.classList.add('hidden'));
    const map = {
      overview: 'team-overview',
      reconciliation: 'team-reconciliation',
      restaurants: 'team-restaurants',
      audit: 'team-audit',
    };
    el(map[section])?.classList.remove('hidden');
    el('teamSectionTitle').textContent = section.charAt(0).toUpperCase() + section.slice(1);
    document.querySelectorAll('[data-team-section]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.teamSection === section);
    });

    if (section === 'reconciliation' && state.permissions.includes('finance.read')) loadReconciliation();
    if (section === 'restaurants' && state.permissions.includes('restaurants.read')) loadRestaurants();
    if (section === 'audit' && state.permissions.includes('audit.read')) loadAuditLogs();
  }

  function buildNav() {
    const nav = el('teamNav');
    if (!nav) return;
    const items = [{ id: 'overview', label: '🏠 Overview', always: true }];
    if (state.permissions.includes('finance.read')) items.push({ id: 'reconciliation', label: '💳 Reconciliation' });
    if (state.permissions.includes('restaurants.read')) items.push({ id: 'restaurants', label: '🏢 Restaurants' });
    if (state.permissions.includes('audit.read')) items.push({ id: 'audit', label: '📋 Audit Logs' });

    nav.innerHTML = items.map((item) => `
      <button class="admin-link${item.id === 'overview' ? ' active' : ''}" data-team-section="${item.id}" type="button">${item.label}</button>
    `).join('');

    nav.querySelectorAll('[data-team-section]').forEach((btn) => {
      btn.addEventListener('click', () => setSection(btn.dataset.teamSection));
    });
  }

  async function loadPermissions() {
    const data = await apiRequest('/api/team/me/permissions', {}, true);
    state.permissions = data.permissions || [];
    state.role = data.role;
    el('teamRoleLabel').textContent = `Role: ${state.role.replace(/_/g, ' ')}`;
    el('teamPermissions').innerHTML = state.permissions.map((p) => `<span class="chip">${p}</span>`).join('') || '<p>No permissions assigned.</p>';

    const cards = [
      ['Role', state.role.replace(/_/g, ' ')],
      ['Permissions', state.permissions.length],
      ['Finance access', state.permissions.includes('finance.read') ? 'Yes' : 'No'],
      ['Restaurant access', state.permissions.includes('restaurants.read') ? 'Yes' : 'No'],
    ];
    el('teamSummaryCards').innerHTML = cards.map(([, label, value]) => `
      <article class="summary-card"><p>${label}</p><strong>${value}</strong></article>
    `).join('').replace(/<p>Role<\/p><strong>([^<]+)<\/strong>/, '<p>Role</p><strong>$1</strong>');
    el('teamSummaryCards').innerHTML = cards.map(([label, value]) => `
      <article class="summary-card"><p>${label}</p><strong>${value}</strong></article>
    `).join('');

    buildNav();
  }

  async function loadReconciliation() {
    const q = el('teamReconSearch')?.value || '';
    const data = await apiRequest(`/api/admin/reconciliation/transactions?q=${encodeURIComponent(q)}`, {}, true);
    const summary = data.summary || {};
    el('teamReconSummary').innerHTML = `
      <article class="summary-card"><p>Gross paid</p><strong>${money(summary.gross_paid)}</strong></article>
      <article class="summary-card"><p>Commission</p><strong>${money(summary.total_commission)}</strong></article>
      <article class="summary-card"><p>Net to restaurants</p><strong>${money(summary.net_to_restaurants)}</strong></article>
      <article class="summary-card"><p>Transactions</p><strong>${summary.total_count || 0}</strong></article>
    `;

    const rows = data.transactions || [];
    el('teamReconTable').innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>Order</th><th>Restaurant</th><th>Gross</th><th>Commission</th><th>Net</th><th>Cashfree ID</th><th>Status</th><th>Date</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>#${r.order_id}<br><small>${r.invoice_number || ''}</small></td>
              <td>${r.restaurant_name}</td>
              <td>${money(r.gross_amount)}</td>
              <td>${money(r.commission_amount)}</td>
              <td>${money(r.restaurant_amount)}</td>
              <td><small>${r.cashfree_order_id || '—'}</small></td>
              <td>${r.payment_status}</td>
              <td>${new Date(r.created_at).toLocaleString()}</td>
            </tr>
          `).join('') || '<tr><td colspan="8">No transactions found.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  async function loadRestaurants() {
    const data = await apiRequest('/api/team/restaurants', {}, true);
    el('teamRestaurantsList').innerHTML = (data.restaurants || []).map((r) => `
      <article class="admin-list-item">
        <div><strong>${r.name}</strong><p>${r.owner_email || ''} · ${r.is_active ? 'Active' : 'Inactive'}</p></div>
        <span class="chip">${money(r.total_revenue || 0)}</span>
      </article>
    `).join('') || '<p>No restaurants.</p>';
  }

  async function loadAuditLogs() {
    const data = await apiRequest('/api/team/audit-logs?limit=100', {}, true);
    el('teamAuditList').innerHTML = (data.logs || []).map((log) => `
      <article class="admin-list-item">
        <div>
          <strong>${log.action}</strong>
          <p>${log.resource_type} ${log.resource_id || ''} · ${log.actor_role || 'system'}</p>
          <small>${new Date(log.created_at).toLocaleString()}</small>
        </div>
      </article>
    `).join('') || '<p>No audit logs.</p>';
  }

  function ensureAuth() {
    const auth = getAuth();
    if (!auth?.token) {
      window.location.href = './auth.html';
      return null;
    }
    if (auth.user.role === 'super_admin') {
      window.location.href = './admin.html';
      return null;
    }
    if (!PLATFORM_ROLES.has(auth.user.role)) {
      window.location.href = './auth.html';
      return null;
    }
    el('teamUserName').textContent = auth.user.name || 'Team Member';
    return auth;
  }

  async function init() {
    if (!ensureAuth()) return;
    el('teamLogoutBtn')?.addEventListener('click', () => {
      clearAuth();
      window.location.href = './auth.html';
    });
    el('teamReconRefresh')?.addEventListener('click', loadReconciliation);
    el('teamReconSearch')?.addEventListener('input', () => {
      clearTimeout(window.__teamReconTimer);
      window.__teamReconTimer = setTimeout(loadReconciliation, 300);
    });

    try {
      await loadPermissions();
      setSection('overview');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  init();
})();
