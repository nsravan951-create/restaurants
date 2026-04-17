window.APP_CONFIG = {
  API_BASE_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : (window.API_BASE_URL || 'https://your-railway-backend.up.railway.app/api'),
  SOCKET_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : (window.SOCKET_URL || 'https://your-railway-backend.up.railway.app'),
};
