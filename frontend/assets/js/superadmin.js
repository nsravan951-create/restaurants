(function(){
  const SOCKET = window.APP_CONFIG?.SOCKET_URL || window.API_URL || location.origin;

  const cardsConfig = [
    { key: 'totalRestaurants', title: 'Total Restaurants', value: 0 },
    { key: 'activeOrders', title: 'Active Orders', value: 0 },
    { key: 'activeTables', title: 'Active Tables', value: 0 },
    { key: 'revenueToday', title: 'Revenue Today', value: 0 },
    { key: 'monthlyRevenue', title: 'Monthly Revenue', value: 0 },
    { key: 'pendingPayments', title: 'Pending Payments', value: 0 },
    { key: 'onlinePayments', title: 'Online Payments', value: 0 },
    { key: 'cashOrders', title: 'Cash Orders', value: 0 },
  ];

  const el = (id) => document.getElementById(id);

  function renderCards(stats){
    const container = el('saCards');
    container.innerHTML = cardsConfig.map((c) => {
      const v = stats && stats[c.key] !== undefined ? stats[c.key] : c.value;
      return `<div class="sa-card" data-key="${c.key}"><div class="sa-card__title">${c.title}</div><div class="sa-card__value">${v}</div></div>`;
    }).join('');
  }

  async function fetchStats(){
    try {
      return await apiRequest('/api/admin/stats', { method: 'GET' }, true);
    } catch (e) {
      console.warn('admin stats fetch failed, fallback', e.message);
    }

    return {};
  }

  async function refreshAll(){
    const stats = await fetchStats().catch(() => ({}));
    renderCards(stats);
    await Promise.all([renderRestaurants(), renderLiveOrders(), renderLiveTables()]);
  }

  async function renderRestaurants(){
    const container = el('saRestaurants');
    container.innerHTML = '<p>Loading...</p>';
    try {
      const data = await apiRequest('/api/admin/restaurants', { method: 'GET' }, true);
      const rows = Array.isArray(data.restaurants) ? data.restaurants : [];
      if (!rows.length) { container.innerHTML = '<p>No restaurants found</p>'; return; }

      container.innerHTML = rows.map(r=>{
        const subStatus = r.subscription_status || 'inactive';
        const subPlan = r.subscription_plan || '—';
        const expires = r.subscription_expires_at ? new Date(r.subscription_expires_at).toLocaleString() : '—';
        const actionBtn = subStatus === 'active'
          ? `<button class="btn btn-danger sa-unsubscribe" data-id="${r.id}">Unsubscribe</button>`
          : `<button class="btn btn-primary sa-subscribe" data-id="${r.id}">Subscribe</button>`;

        return `<div class="sa-row"><img src="${r.logo || ''}" alt="" class="sa-row__logo" /><div class="sa-row__main"><strong>${r.name}</strong><div class="muted">${r.phone || ''} • ${r.address || ''}</div><div class="muted">Owner: ${r.owner_name||'—'} • ${r.owner_email||'—'}</div></div><div class="sa-row__meta">Plan: ${subPlan}<br/>Status: ${subStatus}<br/>Expires: ${expires}<br/>${actionBtn}</div></div>`;
      }).join('');

      // attach handlers
      container.querySelectorAll('.sa-subscribe').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          const id = ev.currentTarget.dataset.id;
          try {
            await apiRequest(`/api/admin/restaurants/${id}/subscribe`, { method: 'POST', body: JSON.stringify({ plan: 'Premium', months: 1 }) }, true);
            await refreshAll();
          } catch (err) { alert('Subscribe failed: '+(err.message||err)); }
        });
      });

      container.querySelectorAll('.sa-unsubscribe').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          const id = ev.currentTarget.dataset.id;
          if (!confirm('Unsubscribe this restaurant?')) return;
          try {
            await apiRequest(`/api/admin/restaurants/${id}/unsubscribe`, { method: 'POST' }, true);
            await refreshAll();
          } catch (err) { alert('Unsubscribe failed: '+(err.message||err)); }
        });
      });

    } catch (e) { container.innerHTML = '<p>Error loading restaurants</p>'; console.error(e); }
  }

  async function renderLiveOrders(){
    const container = el('saLiveOrders');
    container.innerHTML = '<p>Loading live orders...</p>';
    try {
      const data = await apiRequest('/api/admin/orders/active', { method: 'GET' }, true).catch(()=>({ orders: [] }));
      const rows = Array.isArray(data.orders) ? data.orders : [];
      if (!rows.length) { container.innerHTML = '<p>No live orders</p>'; return; }
      container.innerHTML = rows.map(o=>`<div class="sa-row"><div><strong>Order #${o.id}</strong> • Table ${o.table_number || o.table_id}</div><div class="muted">${o.status} • ₹${o.total_amount}</div></div>`).join('');
    } catch (e) { container.innerHTML = '<p>Error loading orders</p>'; console.error(e) }
  }

  async function renderLiveTables(){
    const container = el('saLiveTables');
    container.innerHTML = '<p>Loading live tables...</p>';
    try {
      const data = await apiRequest('/api/admin/restaurants', { method: 'GET' }, true);
      const rows = Array.isArray(data.restaurants) ? data.restaurants : [];
      container.innerHTML = rows.slice(0,12).map(r=>`<div class="sa-table">${r.name} • ${r.active_tables||0} active</div>`).join('');
    } catch (e) { container.innerHTML = '<p>Error loading tables</p>'; console.error(e) }
  }

  function initSocket(){
    try{
      const socket = io(SOCKET, { transports: ['websocket','polling'] });
      socket.on('connect', () => console.log('SuperAdmin socket connected'));
      socket.on('order:update:global', (payload) => {
        try { const elv = document.querySelector('.sa-card[data-key="activeOrders"] .sa-card__value'); if (elv) elv.textContent = Number(elv.textContent||0) + (payload.type==='created'?1:0); } catch(e){}
        renderLiveOrders();
        renderRestaurants();
      });
      socket.on('table:update', (payload) => { renderLiveTables(); });
    }catch(e){console.warn('socket init failed', e.message)}
  }

  // sidebar nav
  document.querySelectorAll('.sa-link').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.sa-link').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const section = btn.dataset.saSection;
      document.querySelectorAll('.sa-section').forEach(s=>s.classList.add('hidden'));
      const target = document.getElementById('section-'+section);
      if (target) target.classList.remove('hidden');
      const title = document.getElementById('saTitle');
      if (title) title.textContent = btn.textContent;
    });
  });

  document.getElementById('saRefresh').addEventListener('click', ()=>refreshAll());

  // init
  refreshAll();
  initSocket();

})();
