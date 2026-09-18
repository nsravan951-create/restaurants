/**
 * AutoResto UI Components Library
 * Accessible modal dialogs, slide-out drawers, toast notifications, status badges, skeletons.
 */
(function initAutoRestoUI() {
  let toastContainer = null;
  const activeModals = new Set();
  let previouslyFocusedElement = null;

  function ensureToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'ar-toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  // Keyboard accessibility handler for Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (activeModals.size > 0) {
        const lastModalId = Array.from(activeModals).pop();
        window.AutoRestoUI.closeModal(lastModalId);
      }
    }
  });

  window.AutoRestoUI = {
    /**
     * Show an accessible toast notification
     */
    toast(message, type = 'info', duration = 3500) {
      const container = ensureToastContainer();
      const toast = document.createElement('div');
      toast.className = `ar-toast ar-toast--${type}`;
      toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');

      let iconName = 'info';
      if (type === 'success') iconName = 'check';
      else if (type === 'danger' || type === 'error') iconName = 'alert';
      else if (type === 'warning') iconName = 'alert';

      const iconSvg = window.AutoRestoIcons?.get(iconName, `ar-toast-icon ar-text-${type}`) || '';

      toast.innerHTML = `
        <span class="ar-toast-icon-wrap" aria-hidden="true">${iconSvg}</span>
        <span class="ar-toast-msg">${message}</span>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        toast.style.transition = 'all 200ms ease';
        setTimeout(() => toast.remove(), 220);
      }, duration);
    },

    /**
     * Open an accessible modal dialog
     */
    openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      previouslyFocusedElement = document.activeElement;
      modal.classList.add('ar-modal--open');
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      activeModals.add(modalId);

      // Lock body scroll
      document.body.style.overflow = 'hidden';

      // Focus first focusable element
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length > 0) {
        setTimeout(() => focusable[0].focus(), 50);
      }
    },

    /**
     * Close modal dialog
     */
    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      modal.classList.remove('ar-modal--open');
      modal.setAttribute('aria-hidden', 'true');
      activeModals.delete(modalId);

      if (activeModals.size === 0) {
        document.body.style.overflow = '';
      }

      setTimeout(() => {
        if (!modal.classList.contains('ar-modal--open')) {
          modal.classList.add('hidden');
        }
      }, 200);

      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    },

    /**
     * Open slide-out drawer
     */
    openDrawer(drawerId) {
      const drawer = document.getElementById(drawerId);
      if (!drawer) return;
      drawer.classList.add('ar-drawer--open');
      drawer.classList.remove('hidden');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    },

    /**
     * Close slide-out drawer
     */
    closeDrawer(drawerId) {
      const drawer = document.getElementById(drawerId);
      if (!drawer) return;
      drawer.classList.remove('ar-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      setTimeout(() => {
        if (!drawer.classList.contains('ar-drawer--open')) {
          drawer.classList.add('hidden');
        }
      }, 300);
    },

    /**
     * Generate HTML for status badge
     */
    badge(label, variant = 'neutral', withDot = true) {
      return `
        <span class="ar-badge ar-badge--${variant}">
          ${withDot ? '<span class="ar-badge-dot" aria-hidden="true"></span>' : ''}
          <span>${label}</span>
        </span>
      `;
    },

    /**
     * Generate HTML for empty state
     */
    renderEmptyState({ icon = 'orders', title, description, actionText = '', actionId = '' }) {
      const iconSvg = window.AutoRestoIcons?.get(icon) || '';
      return `
        <div class="ar-empty-state">
          <div class="ar-empty-icon">${iconSvg}</div>
          <h3 class="ar-empty-title">${title}</h3>
          <p class="ar-empty-description">${description}</p>
          ${actionText ? `<button type="button" class="ar-btn ar-btn--primary ar-btn--sm" id="${actionId}">${actionText}</button>` : ''}
        </div>
      `;
    },

    /**
     * Generate skeleton placeholder HTML
     */
    renderSkeleton(type = 'text', count = 1) {
      let html = '';
      for (let i = 0; i < count; i++) {
        if (type === 'card') {
          html += '<div class="ar-skeleton ar-skeleton--card" style="margin-bottom:12px;"></div>';
        } else if (type === 'title') {
          html += '<div class="ar-skeleton ar-skeleton--title"></div>';
        } else {
          html += '<div class="ar-skeleton ar-skeleton--text"></div>';
        }
      }
      return html;
    }
  };
})();
