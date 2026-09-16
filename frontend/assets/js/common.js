const STORAGE_KEY = 'qr_ordering_auth';
const API_URL = window.API_URL;

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

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  }).catch((error) => {
    console.error(error);
    throw error;
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (requiresAuth && (response.status === 401 || response.status === 403)) {
      const authFailure = new Error(data.error || data.message || 'Session expired or access denied');
      authFailure.data = data;
      authFailure.status = response.status;
      authFailure.authFailure = true;
      throw authFailure;
    }
    const error = new Error(data.error || data.message || 'Request failed');
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

async function downloadExport(path, filename) {
  const auth = getAuth();
  const headers = {};
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Export failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
