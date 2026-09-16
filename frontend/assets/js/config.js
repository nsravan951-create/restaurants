(function initApiConfig() {
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const isFileProtocol = protocol === 'file:';
  const productionApi = String(
    window.BACKEND_PUBLIC_URL || 'https://restaurant-backend-rxqz.onrender.com'
  ).replace(/\/$/, '');

  window.API_URL = (isLocalHost || isFileProtocol) ? 'http://localhost:5000' : productionApi;
  window.APP_CONFIG = {
    API_BASE_URL: window.API_URL,
    SOCKET_URL: window.API_URL,
    GST_PERCENT: Number(window.GST_PERCENT || 0),
    BILL_THANK_YOU_MESSAGE: window.BILL_THANK_YOU_MESSAGE || 'Thank you for visiting! Please come again.',
  };
})();
