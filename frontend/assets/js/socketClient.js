(function initAutoRestoSocketClient(global) {
  const SOCKET_IO_SOURCES = [
    'assets/js/vendor/socket.io.min.js',
    'https://cdn.socket.io/4.7.5/socket.io.min.js',
  ];

  let loadPromise = null;

  function isAvailable() {
    return typeof global.io === 'function';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-autoresto-socket-io="${src}"]`);
      if (existing) {
        if (isAvailable()) {
          resolve(global.io);
          return;
        }
        existing.addEventListener('load', () => resolve(global.io));
        existing.addEventListener('error', () => reject(new Error(`Socket.IO client failed to load: ${src}`)));
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.dataset.autorestoSocketIo = src;
      script.onload = () => {
        if (isAvailable()) resolve(global.io);
        else reject(new Error('Socket.IO client failed to initialize'));
      };
      script.onerror = () => reject(new Error(`Socket.IO client failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadSocketIoScript() {
    if (isAvailable()) return global.io;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      let lastError = null;
      for (const src of SOCKET_IO_SOURCES) {
        try {
          return await loadScript(src);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Socket.IO client unavailable');
    })();

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
