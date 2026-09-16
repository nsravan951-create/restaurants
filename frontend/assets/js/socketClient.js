(function initAutoRestoSocketClient(global) {
  'use strict';

  const DEFAULT_TRANSPORTS = ['websocket', 'polling'];
  let socket = null;
  let socketSignature = null;
  let loadPromise = null;
  let clientLoaded = false;
  let lastError = null;

  function getBackendUrl() {
    const url = global.APP_CONFIG?.SOCKET_URL
      || global.APP_CONFIG?.BACKEND_PUBLIC_URL
      || global.API_URL
      || global.BACKEND_PUBLIC_URL
      || '';
    return String(url).replace(/\/+$/, '');
  }

  function getVendorUrl() {
    const version = global.APP_CONFIG?.SOCKET_IO_CLIENT_VERSION || '4.8.3';
    const base = global.APP_CONFIG?.ASSET_BASE || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}assets/js/vendor/socket.io.min.js?v=${version}`;
  }

  function isClientReady() {
    return typeof global.io === 'function';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-autoresto-socket-io="${src}"]`);
      if (existing) {
        if (isClientReady()) {
          resolve(global.io);
          return;
        }
        existing.addEventListener('load', () => {
          if (isClientReady()) resolve(global.io);
          else reject(new Error('Socket.IO client failed to initialize'));
        });
        existing.addEventListener('error', () => reject(new Error(`Socket.IO client failed to load: ${src}`)));
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.crossOrigin = 'anonymous';
      script.dataset.autorestoSocketIo = src;
      script.onload = () => {
        if (isClientReady()) resolve(global.io);
        else reject(new Error('Socket.IO client failed to initialize'));
      };
      script.onerror = () => reject(new Error(`Socket.IO client failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureClient() {
    if (isClientReady()) {
      clientLoaded = true;
      return global.io;
    }

    if (loadPromise) return loadPromise;

    const vendorUrl = getVendorUrl();
    console.info('[AutoResto Socket] Loading client:', vendorUrl);

    loadPromise = loadScript(vendorUrl)
      .then((ioFn) => {
        clientLoaded = true;
        lastError = null;
        return ioFn;
      })
      .catch((error) => {
        lastError = error;
        loadPromise = null;
        throw error;
      });

    return loadPromise;
  }

  function buildSignature(backendUrl, options) {
    const auth = options.auth || null;
    return JSON.stringify({ backendUrl, auth });
  }

  function attachCoreHandlers(activeSocket) {
    activeSocket.on('connect', () => {
      lastError = null;
      console.info('[AutoResto Socket] Connected:', activeSocket.id);
    });
    activeSocket.on('disconnect', (reason) => {
      console.info('[AutoResto Socket] Disconnected:', reason);
    });
    activeSocket.on('connect_error', (error) => {
      lastError = error;
      console.error('[AutoResto Socket] Connection failed:', error?.message || error);
    });
    activeSocket.on('reconnect_attempt', (attempt) => {
      console.info('[AutoResto Socket] Reconnect attempt:', attempt);
    });
    activeSocket.on('reconnect', (attempt) => {
      console.info('[AutoResto Socket] Reconnected after', attempt, 'attempt(s)');
    });
    activeSocket.on('reconnect_failed', () => {
      console.error('[AutoResto Socket] Reconnection failed');
    });
  }

  async function connect(options = {}) {
    const backendUrl = String(options.url || getBackendUrl()).replace(/\/+$/, '');
    if (!backendUrl) {
      lastError = new Error('BACKEND_PUBLIC_URL is missing');
      console.error('[AutoResto Socket]', lastError.message);
      return null;
    }

    try {
      await ensureClient();
    } catch (error) {
      console.error('[AutoResto Socket] Client unavailable:', error.message);
      return null;
    }

    if (!isClientReady()) {
      lastError = new Error('Socket.IO client is unavailable');
      console.error('[AutoResto Socket]', lastError.message);
      return null;
    }

    const signature = buildSignature(backendUrl, options);
    if (socket && socketSignature === signature && (socket.connected || socket.active)) {
      return socket;
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
      socketSignature = null;
    }

    const { url, ...socketOptions } = options;
    const mergedOptions = {
      transports: DEFAULT_TRANSPORTS,
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      ...socketOptions,
    };

    console.info('[AutoResto Socket] Connecting to:', backendUrl);
    socket = global.io(backendUrl, mergedOptions);
    socketSignature = signature;
    attachCoreHandlers(socket);
    return socket;
  }

  function getSocket() {
    return socket;
  }

  function disconnect() {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketSignature = null;
  }

  function getStatus() {
    return {
      clientLoaded: clientLoaded || isClientReady(),
      connected: Boolean(socket?.connected),
      socketId: socket?.id || null,
      backendUrl: getBackendUrl(),
      transport: socket?.io?.engine?.transport?.name || null,
      lastError: lastError ? String(lastError.message || lastError) : null,
    };
  }

  global.AutoRestoSocket = {
    ensureClient,
    connect,
    getSocket,
    disconnect,
    getStatus,
    getBackendUrl,
    isClientReady,
  };
})(window);
