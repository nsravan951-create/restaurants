(function initApiConfig() {
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const isFileProtocol = protocol === 'file:';

  const productionApi = String(
    window.BACKEND_PUBLIC_URL || 'https://restaurant-backend-rxqz.onrender.com'
  ).replace(/\/$/, '');

  const apiUrl = (isLocalHost || isFileProtocol) ? 'http://localhost:5000' : productionApi;

  const path = window.location.pathname || '/';
  const pagesMarker = '/pages/';
  const assetBase = path.includes(pagesMarker)
    ? path.slice(0, path.indexOf(pagesMarker) + 1)
    : (path.lastIndexOf('/') > 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '/');

  window.API_URL = apiUrl;
  window.APP_CONFIG = {
    BACKEND_PUBLIC_URL: apiUrl,
    API_BASE_URL: apiUrl,
    SOCKET_URL: apiUrl,
    ASSET_BASE: assetBase,
    SOCKET_IO_CLIENT_VERSION: '4.8.3',
    APP_BUILD_VERSION: '2026.09.16',
    GST_PERCENT: Number(window.GST_PERCENT || 0),
    BILL_THANK_YOU_MESSAGE: window.BILL_THANK_YOU_MESSAGE || 'Thank you for visiting! Please come again.',
  };
})();
