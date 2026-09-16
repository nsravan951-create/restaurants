(function () {
  const RESTAURANT_ROLES = new Set(['owner', 'kitchen', 'staff']);

  const state = { permissions: [], role: '', section: 'overview' };

  const el = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v || 0));
  const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
      settlements: 'team-settlements',
      restaurants: 'team-restaurants',
      upgrades: 'team-upgrades',
      financial: 'team-financial',
      support: 'team-support',
      exports: 'team-exports',
      audit: 'team-audit',
    };
    el(map[section])?.classList.remove('hidden');
    el('teamSectionTitle').textContent = section.charAt(0).toUpperCase() + section.slice(1);
    document.querySelectorAll('[data-team-section]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.teamSection === section);
    });

    if (section === 'reconciliation' && state.permissions.includes('finance.read')) loadReconciliation();
    if (section === 'settlements' && state.permissions.includes('settlements.view')) loadSettlements();
    if (section === 'restaurants' && state.permissions.includes('restaurants.read')) loadRestaurants();
    if (section === 'upgrades' && state.permissions.includes('upgrades.view')) loadUpgradeQueue();
    if (section === 'financial' && state.permissions.includes('bank_details.manage')) loadFinancialPanel();
    if (section === 'support' && state.permissions.includes('support.view')) loadSupportTickets();
    if (section === 'exports' && state.permissions.includes('data.export')) { /* static */ }
    if (section === 'audit' && state.permissions.includes('audit.read')) loadAuditLogs();
  }

  const ROLE_LABELS = {
    payment_manager: 'Payment Manager',
    ads_manager: 'Ads Manager',
    promotions_manager: 'Promotions Manager',
    restaurant_manager: 'Restaurant Manager',
    registration_manager: 'Registration Manager',
    features_manager: 'Features Manager',
    finance_manager: 'Finance Manager',
    settlement_manager: 'Settlement Manager',
    subscription_manager: 'Subscription Manager',
    operations_manager: 'Operations Manager',
    analytics_manager: 'Analytics Manager',
    user_enquiry_manager: 'Support Manager',
    support_manager: 'Support Manager',
    database_manager: 'Database Manager',
    backend_manager: 'Backend Manager',
  };

  function buildNav() {
    const nav = el('teamNav');
    if (!nav) return;
    const items = [{ id: 'overview', label: '🏠 Overview', always: true }];
    if (state.permissions.includes('finance.read') || state.permissions.includes('payments.read')) {
      items.push({ id: 'reconciliation', label: '💳 Payments' });
    }
    if (state.permissions.includes('settlements.view')) {
      items.push({ id: 'settlements', label: '🏦 Settlements' });
    }
    if (state.permissions.includes('restaurants.read') || state.permissions.includes('restaurants.create')) {
      items.push({ id: 'restaurants', label: '🏢 Restaurants' });
    }
    if (state.permissions.includes('upgrades.view')) {
      items.push({ id: 'upgrades', label: '✨ Upgrade Queue' });
    }
    if (state.permissions.includes('bank_details.manage') || state.permissions.includes('bank_details.view')) {
      items.push({ id: 'financial', label: '💳 Financial Details' });
    }
    if (state.permissions.includes('support.view')) {
      items.push({ id: 'support', label: '🎫 Support' });
    }
    if (state.permissions.includes('data.export') || state.permissions.includes('orders.export')) {
      items.push({ id: 'exports', label: '📥 Exports' });
    }
    if (state.permissions.includes('audit.read')) {
      items.push({ id: 'audit', label: '📋 Activity' });
    }

    nav.innerHTML = items.map((item) => `
      <button class="admin-link${item.id === state.section ? ' active' : ''}" data-team-section="${item.id}" type="button">${item.label}</button>
    `).join('');

    nav.querySelectorAll('[data-team-section]').forEach((btn) => {
      btn.addEventListener('click', () => setSection(btn.dataset.teamSection));
    });
  }

  async function loadPermissions() {
    const data = await apiRequest('/api/team/me/permissions', {}, true);
    state.permissions = data.permissions || [];
    state.role = data.role;
    const roleLabel = ROLE_LABELS[state.role] || state.role.replace(/_/g, ' ');
    el('teamRoleLabel').textContent = `Role: ${roleLabel}`;
    el('teamWelcomeText').textContent = `Signed in as ${roleLabel}. You only see sections your role allows — Super Admin has full access.`;
    el('teamPermissions').innerHTML = state.permissions.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join('') || '<p>No permissions assigned.</p>';

    const cards = [
      ['Role', roleLabel],
      ['Permissions', state.permissions.length],
      ['Finance', state.permissions.includes('finance.read') ? 'Granted' : 'Locked'],
      ['Settlements', state.permissions.includes('settlements.view') ? 'Granted' : 'Locked'],
    ];
    el('teamSummaryCards').innerHTML = cards.map(([label, value]) => `
      <article class="summary-card ma-hover-card"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong></article>
    `).join('');

    buildNav();
  }

  async function loadReconciliation() {
    const q = el('teamReconSearch')?.value || '';
    const data = await apiRequest(`/api/admin/reconciliation/transactions?q=${encodeURIComponent(q)}`, {}, true);
    const summary = data.summary || {};
    el('teamReconSummary').innerHTML = `
      <article class="summary-card ma-hover-card"><p>Gross paid</p><strong>${money(summary.gross_paid)}</strong></article>
      <article class="summary-card ma-hover-card"><p>Commission</p><strong>${money(summary.total_commission)}</strong></article>
      <article class="summary-card ma-hover-card"><p>Net to restaurants</p><strong>${money(summary.net_to_restaurants)}</strong></article>
      <article class="summary-card ma-hover-card"><p>Transactions</p><strong>${summary.total_count || 0}</strong></article>
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
              <td>#${r.order_id}<br><small>${escapeHtml(r.invoice_number || '')}</small></td>
              <td>${escapeHtml(r.restaurant_name)}</td>
              <td>${money(r.gross_amount)}</td>
              <td>${money(r.commission_amount)}</td>
              <td>${money(r.restaurant_amount)}</td>
              <td><small>${escapeHtml(r.cashfree_order_id || '—')}</small></td>
              <td>${escapeHtml(r.payment_status)}</td>
              <td>${new Date(r.created_at).toLocaleString()}</td>
            </tr>
          `).join('') || '<tr><td colspan="8">No transactions found.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  async function loadSettlements() {
    const data = await apiRequest('/api/master-admin/settlements', {}, true);
    const root = el('teamSettlementsList');
    if (!root) return;
    root.innerHTML = (data.settlements || []).map((s) => `
      <article class="admin-list-item ma-hover-card">
        <div>
          <strong>${escapeHtml(s.restaurant_name)}</strong>
          <p>Net ${money(s.net_payable)} · ${escapeHtml(s.status)}</p>
          <small>${new Date(s.period_start).toLocaleDateString()} → ${new Date(s.period_end).toLocaleDateString()}</small>
        </div>
        <span class="ma-badge ma-badge--${s.status === 'paid' ? 'success' : 'warn'}">${escapeHtml(s.status)}</span>
      </article>
    `).join('') || '<p>No settlements available.</p>';
  }

  async function loadRestaurants() {
    const data = await apiRequest('/api/master-admin/restaurants', {}, true).catch(() => (
      apiRequest('/api/team/restaurants', {}, true)
    ));
    const restaurants = data.restaurants || [];
    el('teamRestaurantsList').innerHTML = `
      <table class="ma-data-table">
        <thead><tr><th>Restaurant</th><th>Owner</th><th>Status</th><th>Features</th><th>Revenue</th></tr></thead>
        <tbody>
          ${restaurants.map((r) => `
            <tr>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td>${escapeHtml(r.owner_email || r.owner_name || '—')}</td>
              <td>${r.is_active ? 'Active' : 'Inactive'}</td>
              <td>${escapeHtml(r.enabled_features_count || '—')}</td>
              <td>${money(r.total_revenue || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p>No restaurants.</p>';

    const select = el('teamFinancialRestaurant');
    if (select) {
      select.innerHTML = '<option value="">Select restaurant</option>' + restaurants.map((r) => (
        `<option value="${r.id}">${escapeHtml(r.name)}</option>`
      )).join('');
    }
  }

  async function loadUpgradeQueue() {
    const data = await apiRequest('/api/master-admin/upgrade-queue?status=pending', {}, true);
    const queue = data.queue || [];
    el('teamUpgradeQueue').innerHTML = `
      <table class="ma-data-table">
        <thead><tr><th>Restaurant</th><th>Amount</th><th>Cashfree</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${queue.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.restaurant_name)}</strong><br><small>${escapeHtml(item.owner_email || '')}</small></td>
              <td>${money(item.amount)}</td>
              <td><small>${escapeHtml(item.provider_order_id || '—')}</small></td>
              <td>${new Date(item.created_at).toLocaleString()}</td>
              <td>
                ${state.permissions.includes('upgrades.activate') ? `
                  <button class="btn btn-primary btn-sm" type="button" data-team-activate="${item.id}">Activate</button>
                ` : '<span class="muted">View only</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p>No pending upgrades.</p>';

    el('teamUpgradeQueue')?.querySelectorAll('[data-team-activate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/master-admin/upgrade-activations/${btn.dataset.teamActivate}/activate`, {
            method: 'POST',
            body: JSON.stringify({ featureKeys: [] }),
          }, true);
          setMessage('Upgrade marked as activated.');
          await loadUpgradeQueue();
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });
  }

  async function loadFinancialPanel() {
    const previousId = el('teamFinancialRestaurant')?.value;
    await loadRestaurants();
    if (previousId) el('teamFinancialRestaurant').value = previousId;
    const restaurantId = el('teamFinancialRestaurant')?.value;
    const panel = el('teamFinancialPanel');
    if (!panel) return;
    if (!restaurantId) {
      panel.innerHTML = '<p class="muted">Select a restaurant to view and edit payout details.</p>';
      return;
    }

    const data = await apiRequest(`/api/master-admin/restaurants/${restaurantId}/profile`, {}, true);
    const r = data.restaurant || {};
    const bank = (data.bankAccounts || [])[0] || {};
    panel.innerHTML = `
      <form id="teamFinancialForm" class="admin-form ma-financial-form">
        <fieldset><legend>GST &amp; legal</legend>
          <input name="legalName" placeholder="Legal name" value="${escapeHtml(r.legal_name || '')}" />
          <input name="gstin" placeholder="GSTIN" value="${escapeHtml(r.gstin || '')}" />
          <textarea name="businessAddress" placeholder="Business address" rows="2">${escapeHtml(r.business_address || '')}</textarea>
        </fieldset>
        <fieldset><legend>Bank &amp; UPI</legend>
          <input name="accountHolderName" placeholder="Account holder" value="${escapeHtml(bank.account_holder_name || '')}" />
          <input name="bankName" placeholder="Bank name" value="${escapeHtml(bank.bank_name || '')}" />
          <input name="accountNumber" placeholder="Account number (update)" />
          <input name="ifscCode" placeholder="IFSC" value="${escapeHtml(bank.ifsc_code || '')}" />
          <input name="upiVpa" placeholder="UPI VPA" value="${escapeHtml(r.upi_vpa || bank.upi_id || '')}" />
          <p class="muted">On file: ${escapeHtml(bank.account_masked || '—')}</p>
        </fieldset>
        <button class="btn btn-primary" type="submit">Save details</button>
      </form>
    `;

    el('teamFinancialForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.target).entries());
      try {
        await apiRequest(`/api/master-admin/restaurants/${restaurantId}/financial`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }, true);
        setMessage('Financial details saved.');
        await loadFinancialPanel();
      } catch (error) {
        setMessage(error.message, true);
      }
    }, { once: true });
  }

  async function loadAuditLogs() {
    const data = await apiRequest('/api/team/audit-logs?limit=100', {}, true);
    el('teamAuditList').innerHTML = (data.logs || []).map((log) => `
      <article class="admin-list-item ma-hover-card">
        <div>
          <strong>${escapeHtml(log.action)}</strong>
          <p>${escapeHtml(log.resource_type)} ${escapeHtml(log.resource_id || '')} · ${escapeHtml(log.actor_role || 'system')}</p>
          <small>${new Date(log.created_at).toLocaleString()}</small>
        </div>
      </article>
    `).join('') || '<p>No audit logs.</p>';
  }

  async function loadSupportTickets() {
    const data = await apiRequest('/api/master-admin/support-tickets', {}, true);
    const tickets = data.tickets || [];
    el('teamSupportTable').innerHTML = `
      <table class="ma-data-table">
        <thead><tr><th>ID</th><th>Subject</th><th>Restaurant</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
          ${tickets.map((t) => `
            <tr>
              <td>#${t.id}</td>
              <td>${escapeHtml(t.subject)}</td>
              <td>${escapeHtml(t.restaurant_name || 'Platform')}</td>
              <td>${escapeHtml(t.priority)}</td>
              <td>${escapeHtml(t.status)}</td>
              <td>${new Date(t.created_at).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` || '<p>No tickets.</p>';
  }

  function isPlatformTeamUser(user) {
    if (!user?.role) return false;
    if (user.role === 'super_admin' || RESTAURANT_ROLES.has(user.role)) return false;
    if (user.isPlatformTeam) return true;
    return String(user.role).endsWith('_manager');
  }

  async function ensureAuth() {
    const auth = getAuth();
    if (!auth?.token) {
      window.location.href = './auth.html';
      return null;
    }
    if (auth.user.role === 'super_admin') {
      window.location.href = './admin.html';
      return null;
    }
    if (RESTAURANT_ROLES.has(auth.user.role) || !isPlatformTeamUser(auth.user)) {
      try {
        sessionStorage.setItem('owner_auth_message', 'Sign in with Team Staff using your admin-allocated email and password.');
        sessionStorage.setItem('prefer_team_tab', '1');
      } catch (_) {}
      window.location.href = './auth.html';
      return null;
    }
    el('teamUserName').textContent = auth.user.name || 'Team Member';
    return auth;
  }

  async function init() {
    if (!(await ensureAuth())) return;
    el('teamLogoutBtn')?.addEventListener('click', () => {
      clearAuth();
      window.location.href = './auth.html';
    });
    el('teamReconRefresh')?.addEventListener('click', loadReconciliation);
    el('teamReconSearch')?.addEventListener('input', () => {
      clearTimeout(window.__teamReconTimer);
      window.__teamReconTimer = setTimeout(loadReconciliation, 300);
    });
    el('teamFinancialRestaurant')?.addEventListener('change', () => loadFinancialPanel());
    document.querySelectorAll('[data-team-export]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await downloadExport(`/api/master-admin/exports/${btn.dataset.teamExport}`, `${btn.dataset.teamExport}.csv`);
          setMessage('Export downloaded.');
        } catch (error) {
          setMessage(error.message, true);
        }
      });
    });

    try {
      await loadPermissions();
      setSection('overview');
    } catch (error) {
      if (error.status === 403 || error.status === 401) {
        window.location.href = './auth.html';
        return;
      }
      setMessage(error.message, true);
    }
  }

  init();
})();
