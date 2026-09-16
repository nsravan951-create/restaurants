(function initAutoRestoSocketClient(global) {
  const SOCKET_IO_CDN = 'https://cdn.socket.io/4.7.5/socket.io.min.js';

  let loadPromise = null;

  function isAvailable() {
    return typeof global.io === 'function';
  }

  function loadSocketIoScript() {
    if (isAvailable()) return Promise.resolve(global.io);

    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-autoresto-socket-io]');
      if (existing) {
        if (isAvailable()) {
          resolve(global.io);
          return;
        }
        existing.addEventListener('load', () => resolve(global.io));
        existing.addEventListener('error', () => reject(new Error('Socket.IO client failed to load')));
        return;
      }

      const script = document.createElement('script');
      script.src = SOCKET_IO_CDN;
      script.crossOrigin = 'anonymous';
      script.dataset.autorestoSocketIo = 'true';
      script.onload = () => {
        if (isAvailable()) resolve(global.io);
        else reject(new Error('Socket.IO client failed to initialize'));
      };
      script.onerror = () => reject(new Error('Socket.IO client failed to load from CDN'));
      document.head.appendChild(script);
    });

    return loadPromise;
  }

  async function ensureClient() {
    if (isAvailable()) return global.io;
    try {
      return await loadSocketIoScript();
    } catch (error) {
      console.warn('[AutoResto] Socket.IO client unavailable:', error.message);
      return null;
    }
  }

  async function connect(url, options = {}) {
    const ioFn = await ensureClient();
    if (!ioFn) return null;
    return ioFn(url, options);
  }

  global.AutoRestoSocket = {
    isAvailable,
    ensureClient,
    connect,
  };
})(window);
