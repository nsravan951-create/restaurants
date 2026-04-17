function ensureAdminAuth() {
  const auth = getAuth();
  if (!auth || !auth.token || auth.user.role !== 'super_admin') {
    setMessage('adminMessage', 'Please login as super admin from Auth page.', true);
    return null;
  }
  return auth;
}

async function loadSummary() {
  const data = await apiRequest('/admin/summary', {}, true);
  document.getElementById('summaryCards').innerHTML = `
    <div class="card"><h3>${data.totalOrders}</h3><p>Total Orders</p></div>
    <div class="card"><h3>${data.totalRestaurants}</h3><p>Total Restaurants</p></div>
    <div class="card"><h3>${data.totalActiveAds}</h3><p>Active Ads</p></div>
  `;
}

async function loadRestaurants() {
  const data = await apiRequest('/admin/restaurants', {}, true);
  const root = document.getElementById('restaurantsTable');

  root.innerHTML = data.restaurants.map((restaurant) => `
    <div class="card">
      <strong>#${restaurant.id} ${restaurant.name}</strong>
      <p>Owner: ${restaurant.owner_name || 'N/A'} (${restaurant.owner_email || 'N/A'})</p>
      <p>Status: ${restaurant.is_active ? 'Active' : 'Disabled'}</p>
      <button class="btn btn-light" data-toggle-restaurant="${restaurant.id}">Toggle Active</button>
    </div>
  `).join('') || '<p>No restaurants found.</p>';

  root.querySelectorAll('button[data-toggle-restaurant]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/admin/restaurants/${button.dataset.toggleRestaurant}/toggle`, { method: 'PATCH' }, true);
        await loadRestaurants();
      } catch (error) {
        setMessage('adminMessage', error.message, true);
      }
    });
  });
}

async function loadAds() {
  const data = await apiRequest('/ads', {}, true);
  const root = document.getElementById('adsList');

  root.innerHTML = data.ads.map((ad) => `
    <div class="card">
      <strong>${ad.title}</strong>
      <p>Target: ${ad.target_link}</p>
      <p>Clicks: ${ad.clicks}</p>
      <button class="btn btn-dark" data-delete-ad="${ad.id}">Delete Ad</button>
    </div>
  `).join('') || '<p>No ads found.</p>';

  root.querySelectorAll('button[data-delete-ad]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/ads/${button.dataset.deleteAd}`, { method: 'DELETE' }, true);
        await loadAds();
      } catch (error) {
        setMessage('adminMessage', error.message, true);
      }
    });
  });
}

document.getElementById('adForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    await apiRequest('/ads', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.get('title'),
        imageUrl: formData.get('imageUrl'),
        targetLink: formData.get('targetLink'),
        restaurantId: formData.get('restaurantId') ? Number(formData.get('restaurantId')) : null,
        isActive: true,
      }),
    }, true);

    event.target.reset();
    await loadAds();
    setMessage('adminMessage', 'Ad created successfully');
  } catch (error) {
    setMessage('adminMessage', error.message, true);
  }
});

async function initAdmin() {
  if (!ensureAdminAuth()) return;

  try {
    await loadSummary();
    await loadRestaurants();
    await loadAds();
  } catch (error) {
    setMessage('adminMessage', error.message, true);
  }
}

initAdmin();
