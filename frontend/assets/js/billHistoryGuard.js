(function initAutoRestoBillHistoryGuard(global) {
  const LOCK_KEY = 'autoresto_bill_history_lock';

  let locked = false;
  let lockState = null;
  let popHandler = null;
  let pageshowHandler = null;

  function buildCleanBillUrl(pathname, orderId, extraParams = {}) {
    const params = new URLSearchParams();
    if (orderId) params.set('orderId', String(orderId));
    params.set('status', 'paid');
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value != null && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    const path = pathname || global.location.pathname;
    return query ? `${path}?${query}` : path;
  }

  function persistLockMeta(orderId) {
    try {
      sessionStorage.setItem(LOCK_KEY, JSON.stringify({
        orderId,
        path: global.location.pathname,
        lockedAt: Date.now(),
      }));
    } catch (_) {}
  }

  function readLockMeta() {
    try {
      return JSON.parse(sessionStorage.getItem(LOCK_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function clearLockMeta() {
    try {
      sessionStorage.removeItem(LOCK_KEY);
    } catch (_) {}
  }

  function unlock() {
    locked = false;
    lockState = null;
    clearLockMeta();
    if (popHandler) {
      global.removeEventListener('popstate', popHandler);
      popHandler = null;
    }
    if (pageshowHandler) {
      global.removeEventListener('pageshow', pageshowHandler);
      pageshowHandler = null;
    }
  }

  function reapplyLock() {
    if (!locked || !lockState) return;
    const { stateObj, cleanUrl } = lockState;
    global.history.pushState(stateObj, '', cleanUrl);
  }

  function lockPaidBillHistory(options = {}) {
    const {
      orderId,
      pathname = global.location.pathname,
      stateExtras = {},
      extraParams = {},
      onBackBlocked,
    } = options;

    if (!orderId) return false;
    if (locked && lockState?.stateObj?.orderId === orderId) {
      reapplyLock();
      return true;
    }

    const cleanUrl = buildCleanBillUrl(pathname, orderId, extraParams);
    const stateObj = {
      autorestoPaidBill: true,
      orderId,
      ...stateExtras,
    };

    global.history.replaceState(stateObj, '', cleanUrl);
    global.history.pushState(stateObj, '', cleanUrl);

    locked = true;
    lockState = { stateObj, cleanUrl, onBackBlocked };
    persistLockMeta(orderId);

    if (popHandler) global.removeEventListener('popstate', popHandler);
    popHandler = () => {
      if (!locked || !lockState) return;
      reapplyLock();
      if (typeof lockState.onBackBlocked === 'function') {
        lockState.onBackBlocked();
      }
    };
    global.addEventListener('popstate', popHandler);

    if (pageshowHandler) global.removeEventListener('pageshow', pageshowHandler);
    pageshowHandler = (event) => {
      if (!locked || !event.persisted) return;
      reapplyLock();
    };
    global.addEventListener('pageshow', pageshowHandler);

    return true;
  }

  function restoreLockFromSession(orderId, options = {}) {
    const meta = readLockMeta();
    if (!meta?.orderId) return false;
    if (orderId && Number(meta.orderId) !== Number(orderId)) return false;
    return lockPaidBillHistory({
      orderId: meta.orderId,
      pathname: options.pathname || meta.path || global.location.pathname,
      stateExtras: options.stateExtras || {},
      extraParams: options.extraParams || {},
      onBackBlocked: options.onBackBlocked,
    });
  }

  function isLocked() {
    return locked;
  }

  global.AutoRestoBillHistoryGuard = {
    lockPaidBillHistory,
    restoreLockFromSession,
    unlock,
    isLocked,
    buildCleanBillUrl,
  };
})(window);
