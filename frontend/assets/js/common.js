const STORAGE_KEY = 'qr_ordering_auth';

function setAuth(authData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
}

function getAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

async function apiRequest(path, options = {}, requiresAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (requiresAuth) {
    const auth = getAuth();
    if (auth && auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }
  }

  const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed');
    error.data = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

function setMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#ad1f1f' : '#105f53';
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}
