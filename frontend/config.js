// Legacy module entry point. Production pages use assets/js/config.js instead.
const API_URL = window.BACKEND_PUBLIC_URL
  || window.APP_CONFIG?.BACKEND_PUBLIC_URL
  || 'https://restaurant-backend-rxqz.onrender.com';

export default API_URL;
