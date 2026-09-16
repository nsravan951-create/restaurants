(function initAutoRestoPageTransition(global) {
  const STORAGE_KEY = 'ar_page_transition';
  const HISTORY_KEY = 'ar_page_transition_history';
  const MIN_DURATION = 700;
  const MAX_DURATION = 1200;

  let overlay = null;
  let navigating = false;

  function prefersReducedMotion() {
    return global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isSameOriginUrl(url) {
    try {
      const target = new URL(url, global.location.href);
      return target.origin === global.location.origin;
    } catch (_) {
      return false;
    }
  }

  function resolveUrl(url) {
    return new URL(url, global.location.href).href;
  }

  function shouldSkipLink(anchor) {
    if (!anchor || anchor.tagName !== 'A') return true;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return true;
    }
    if (anchor.hasAttribute('download')) return true;
    if (anchor.target && anchor.target !== '_self') return true;
    if (anchor.dataset.arNoTransition === 'true') return true;
    if (!isSameOriginUrl(href)) return true;
    return false;
  }

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ar-transition-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Loading next page');
    overlay.innerHTML = `
      <div class="ar-transition-stage">
        <div class="ar-transition-ring-wrap" aria-hidden="true">
          <div class="ar-transition-ring"></div>
        </div>
        <svg class="ar-transition-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M10 30c0-8 5-14 14-14s14 6 14 14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M24 10v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <ellipse cx="24" cy="32" rx="12" ry="4" fill="currentColor" opacity="0.12"/>
          <path d="M16 22h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p class="ar-transition-wordmark"><span class="ar-auto">Auto</span><span class="ar-resto">Resto</span></p>
        <p class="ar-transition-status">Preparing...</p>
        <div class="ar-transition-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function resetOverlayClasses() {
    if (!overlay) return;
    overlay.classList.remove('is-active', 'is-brand', 'is-loading', 'is-dissolve', 'is-blocking');
  }

  async function playFullTransition(statusText = 'Preparing...') {
    const reduced = prefersReducedMotion();
    const node = buildOverlay();
    const statusEl = node.querySelector('.ar-transition-status');
    if (statusEl) statusEl.textContent = statusText;

    const started = performance.now();

    if (reduced) {
      node.classList.add('is-active', 'is-brand', 'is-blocking');
      await wait(120);
      node.classList.add('is-dissolve');
      await wait(80);
      resetOverlayClasses();
      return;
    }

    node.classList.add('is-active', 'is-blocking');
    await wait(80);
    node.classList.add('is-brand');
    await wait(180);

    node.classList.add('is-loading');
    if (statusEl) statusEl.textContent = 'Loading...';
    await wait(380);

    const elapsed = performance.now() - started;
    const remaining = Math.max(0, MIN_DURATION - elapsed);
    if (remaining > 0) await wait(Math.min(remaining, 250));

    node.classList.add('is-dissolve');
    await wait(220);

    const totalElapsed = performance.now() - started;
    if (totalElapsed < MIN_DURATION) {
      await wait(MIN_DURATION - totalElapsed);
    }

    resetOverlayClasses();
  }

  function markTransitionPending(mode = 'full') {
    try {
      sessionStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }

  function consumeTransitionFlag() {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return value;
    } catch (_) {
      return null;
    }
  }

  function isHistoryNavigation() {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    return nav?.type === 'back_forward';
  }

  function initPageEntrance() {
    const flag = consumeTransitionFlag();
    const historyFlag = (() => {
      try {
        const v = sessionStorage.getItem(HISTORY_KEY);
        sessionStorage.removeItem(HISTORY_KEY);
        return v;
      } catch (_) {
        return null;
      }
    })();

    if (flag === 'full') {
      if (prefersReducedMotion()) {
        document.body.classList.add('ar-page-enter-active');
        return;
      }
      document.body.classList.add('ar-page-enter-pending');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.add('ar-page-enter-active');
          document.body.classList.remove('ar-page-enter-pending');
          setTimeout(() => document.body.classList.remove('ar-page-enter-active'), 450);
        });
      });
      return;
    }

    if ((historyFlag === '1' || isHistoryNavigation()) && !prefersReducedMotion()) {
      document.body.classList.add('ar-page-enter-history');
      setTimeout(() => document.body.classList.remove('ar-page-enter-history'), 320);
    }
  }

  async function navigate(url, options = {}) {
    const destination = resolveUrl(url);
    if (navigating) return false;
    if (destination === global.location.href) return false;

    navigating = true;
    buildOverlay().classList.add('is-blocking');

    try {
      if (typeof options.beforeNavigate === 'function') {
        await options.beforeNavigate();
      }

      const waitFor = options.waitFor
        ? Promise.resolve(options.waitFor).catch(() => null)
        : Promise.resolve();

      markTransitionPending('full');

      const animationPromise = playFullTransition(options.statusText || 'Preparing...');
      const dataPromise = waitFor;

      await Promise.all([animationPromise, dataPromise]);

      global.location.href = destination;
      return true;
    } catch (error) {
      resetOverlayClasses();
      navigating = false;
      if (typeof options.onError === 'function') options.onError(error);
      throw error;
    }
  }

  function bindLinks(root = document, selector = 'a[href]') {
    root.addEventListener('click', (event) => {
      const anchor = event.target.closest(selector);
      if (!anchor || shouldSkipLink(anchor)) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const href = anchor.getAttribute('href');
      const destination = resolveUrl(href);
      if (destination === global.location.href) return;

      event.preventDefault();
      navigate(destination).catch(() => {
        global.location.href = destination;
      });
    });
  }

  function trackHistoryNavigation() {
    global.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        try { sessionStorage.setItem(HISTORY_KEY, '1'); } catch (_) {}
        initPageEntrance();
      }
    });

    global.addEventListener('popstate', () => {
      try { sessionStorage.setItem(HISTORY_KEY, '1'); } catch (_) {}
    });
  }

  function boot(options = {}) {
    if (document.documentElement.dataset.arTransition === 'off') return;

    buildOverlay();
    initPageEntrance();

    if (options.bindLinks !== false && document.documentElement.dataset.arTransitionLinks !== 'off') {
      bindLinks(document, options.linkSelector || 'a[href]');
    }

    trackHistoryNavigation();
  }

  global.AutoRestoTransition = {
    navigate,
    bindLinks,
    boot,
    initPageEntrance,
    prefersReducedMotion,
  };

  if (document.documentElement.dataset.arTransitionAutoBoot !== 'off') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => boot());
    } else {
      boot();
    }
  }
})(window);
