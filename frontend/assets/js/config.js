(function initApiConfig() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  const productionApi = 'https://restaurant-backend-rxqz.onrender.com';

  window.API_URL = isLocal ? 'http://localhost:5000' : productionApi;
  window.APP_CONFIG = {
    API_BASE_URL: window.API_URL,
    SOCKET_URL: window.API_URL,
    GST_PERCENT: Number(window.GST_PERCENT || 0),
    BILL_THANK_YOU_MESSAGE: window.BILL_THANK_YOU_MESSAGE || 'Thank you for visiting! Please come again.',
  };
})();
