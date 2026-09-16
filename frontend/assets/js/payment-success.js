(function initPaymentSuccessPage() {
  const API_URL = window.API_URL || window.APP_CONFIG?.API_BASE_URL || 'http://localhost:5000';
  const STORAGE_KEY = 'autoresto_payment_success_context';
  const POLL_MS = 5000;

  const els = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorText: document.getElementById('errorText'),
    pendingState: document.getElementById('pendingState'),
    failedState: document.getElementById('failedState'),
    successState: document.getElementById('successState'),
    billPrinterRoot: document.getElementById('billPrinterRoot'),
    checkStatusBtn: document.getElementById('checkStatusBtn'),
    retryPaymentBtn: document.getElementById('retryPaymentBtn'),
  };

  const state = {
    context: null,
    invoice: null,
    pollTimer: null,
    printerStarted: false,
  };

  function readParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      orderId: Number(params.get('orderId') || 0),
      sessionToken: String(params.get('sessionToken') || '').trim(),
      status: String(params.get('status') || '').trim().toLowerCase(),
      tableId: params.get('tableId'),
      qrToken: String(params.get('token') || '').trim(),
    };
  }

  function loadStoredContext() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function saveContext(context) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    state.context = context;
  }

  function resolveContext() {
    const params = readParams();
    const stored = loadStoredContext();
    const orderId = params.orderId || stored?.orderId || 0;
    const sessionToken = params.sessionToken || stored?.sessionToken || '';
    const context = {
      orderId,
      sessionToken,
      status: params.status || stored?.status || '',
      tableId: params.tableId || stored?.tableId || null,
      qrToken: params.qrToken || stored?.qrToken || '',
    };
    if (orderId && sessionToken) saveContext(context);
    return context;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showOnly(section) {
    ['loadingState', 'errorState', 'pendingState', 'failedState', 'successState'].forEach((id) => {
      document.getElementById(id)?.classList.toggle('hidden', id !== section);
    });
  }

  function showError(message) {
    els.errorText.textContent = message;
    showOnly('errorState');
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function buildTableReturnUrl(context) {
    if (context.qrToken) {
      return `table.html?token=${encodeURIComponent(context.qrToken)}`;
    }
    if (context.tableId) {
      return `table.html?id=${encodeURIComponent(context.tableId)}`;
    }
    return 'table.html';
  }

  async function verifyPaymentWithBackend(context) {
    return apiRequest(
      `/api/payments/cashfree/status/${context.orderId}?sessionToken=${encodeURIComponent(context.sessionToken)}`
    );
  }

  async function fetchOrderStatus(context) {
    return apiRequest(
      `/api/invoices/customer/${context.orderId}/status?sessionToken=${encodeURIComponent(context.sessionToken)}`
    );
  }

  async function fetchInvoice(context) {
    const data = await apiRequest(
      `/api/invoices/customer/${context.orderId}?sessionToken=${encodeURIComponent(context.sessionToken)}`
    );
    return data.invoice;
  }

  async function downloadBill() {
    const context = state.context;
    if (!context?.orderId || !context?.sessionToken) throw new Error('Bill is not available.');
    const response = await fetch(
      `${API_URL}/api/invoices/customer/${context.orderId}/view?sessionToken=${encodeURIComponent(context.sessionToken)}&format=pdf`
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'PDF download failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bill-${context.orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function lockPaidBillNavigation(context) {
    const extra = {};
    if (context.tableId) extra.tableId = context.tableId;
    if (context.qrToken) extra.token = context.qrToken;

    window.AutoRestoBillHistoryGuard?.lockPaidBillHistory({
      orderId: context.orderId,
      pathname: window.location.pathname,
      extraParams: extra,
      onBackBlocked: () => {
        showOnly('successState');
      },
    });
  }

  async function startPrinterExperience(invoice, paymentMethod = 'online') {
    if (state.printerStarted) return;
    state.printerStarted = true;
    state.invoice = invoice;
    showOnly('successState');
    document.title = `Payment Successful | ${invoice.restaurant?.name || 'AutoResto'}`;

    lockPaidBillNavigation(state.context);

    const playedKey = `ar_printer_played_${state.context.orderId}`;
    const skipAnimation = sessionStorage.getItem(playedKey) === '1';

    await window.AutoRestoBillPrinter.mount(els.billPrinterRoot, {
      invoice,
      paymentMethod,
      orderId: state.context.orderId,
      skipAnimation,
      onDownload: () => {
        downloadBill().catch((error) => window.alert(error.message));
      },
      onShare: (inv, sections) => {
        window.AutoRestoBillPrinter.shareBill(inv, sections, window.location.href.split('#')[0]);
      },
      onSubmitReview: async ({ rating, comment }) => {
        await apiRequest('/api/reviews', {
          method: 'POST',
          body: JSON.stringify({
            orderId: state.context.orderId,
            sessionToken: state.context.sessionToken,
            rating,
            comment,
          }),
        });
      },
    });
  }

  async function showPaid(context, paymentMethod = 'online') {
    stopPolling();
    context.status = 'paid';
    saveContext(context);
    const invoice = await fetchInvoice(context);
    await startPrinterExperience(invoice, paymentMethod);
  }

  function showPending() {
    showOnly('pendingState');
  }

  function showFailed(context) {
    stopPolling();
    context.status = 'failed';
    saveContext(context);
    showOnly('failedState');
  }

  async function refreshPaymentState(context) {
    try {
      await verifyPaymentWithBackend(context);
    } catch (error) {
      console.warn('Cashfree verification failed:', error.message);
    }

    const status = await fetchOrderStatus(context);
    if (status.paymentStatus === 'paid') {
      const method = status.paymentMethod === 'cash' ? 'cash' : 'online';
      await showPaid(context, method);
      return 'paid';
    }
    if (status.paymentStatus === 'failed') {
      showFailed(context);
      return 'failed';
    }
    showPending();
    return 'pending';
  }

  function startPolling(context) {
    stopPolling();
    state.pollTimer = setInterval(() => {
      refreshPaymentState(context).catch((error) => console.warn(error.message));
    }, POLL_MS);
  }

  function bindEvents() {
    els.checkStatusBtn?.addEventListener('click', () => {
      if (!state.context) return;
      els.checkStatusBtn.disabled = true;
      refreshPaymentState(state.context)
        .catch((error) => showError(error.message || 'Unable to check payment status.'))
        .finally(() => { els.checkStatusBtn.disabled = false; });
    });

    els.retryPaymentBtn?.addEventListener('click', () => {
      window.AutoRestoBillHistoryGuard?.unlock();
      window.location.href = buildTableReturnUrl(state.context || {});
    });
  }

  function scrubPaymentReturnEntry() {
    try {
      history.replaceState(
        { autorestoPaymentScrub: true },
        '',
        window.location.href
      );
    } catch (_) {}
  }

  async function boot() {
    bindEvents();
    scrubPaymentReturnEntry();
    const context = resolveContext();
    state.context = context;

    if (context.status === 'error' || !context.orderId || !context.sessionToken) {
      showError('This payment link is invalid or access was denied.');
      return;
    }

    try {
      if (context.status === 'failed') {
        window.AutoRestoBillHistoryGuard?.unlock();
        showFailed(context);
        return;
      }

      if (context.status === 'paid' && context.orderId) {
        window.AutoRestoBillHistoryGuard?.restoreLockFromSession(context.orderId, {
          pathname: window.location.pathname,
          extraParams: {
            ...(context.tableId ? { tableId: context.tableId } : {}),
            ...(context.qrToken ? { token: context.qrToken } : {}),
          },
          onBackBlocked: () => showOnly('successState'),
        });
      }

      const paymentState = await refreshPaymentState(context);
      if (paymentState === 'pending') {
        startPolling(context);
      }
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        showError('Order not found or access denied.');
        return;
      }
      showError(error.message || 'Unable to load payment details.');
    }
  }

  boot();
})();
