window.API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://restaurant-backend-rxqz.onrender.com';

window.APP_CONFIG = {
  API_BASE_URL: window.API_URL,
  SOCKET_URL: window.API_URL,
};
