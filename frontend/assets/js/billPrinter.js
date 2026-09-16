(function initAutoRestoBillPrinter(global) {
  const ANIMATION_KEY_PREFIX = 'ar_printer_played_';

  function prefersReducedMotion() {
    return global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  }

  function money(value) {
    return Number(value || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buildReceiptSections(invoice) {
    const restaurantName = invoice.restaurant?.name || 'Restaurant';
    const orderLabel = invoice.order?.invoiceNumber || `#${invoice.order?.id}`;
    const createdAt = new Date(invoice.order?.createdAt || Date.now()).toLocaleString();
    const logoUrl = invoice.restaurant?.logoUrl || '';
    const taxTotal = Number(invoice.cgstAmount || 0) + Number(invoice.sgstAmount || 0) + Number(invoice.igstAmount || 0);

    const itemsHtml = (invoice.items || []).map((item) => `
      <div class="bp-item-row">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.quantity} × ₹${money(item.price)}</small>
        </div>
        <strong>₹${money(item.lineTotal)}</strong>
      </div>
    `).join('');

    const totals = [
      `<div class="bp-total-row"><span>Subtotal</span><strong>₹${money(invoice.subtotal)}</strong></div>`,
    ];
    if (Number(invoice.discountAmount) > 0) {
      totals.push(`<div class="bp-total-row"><span>Discount</span><strong>-₹${money(invoice.discountAmount)}</strong></div>`);
    }
    totals.push(`<div class="bp-total-row"><span>Tax</span><strong>₹${money(taxTotal)}</strong></div>`);
    totals.push(`<div class="bp-total-row bp-grand"><span>TOTAL</span><strong>₹${money(invoice.grandTotal)}</strong></div>`);

    const paymentLabel = escapeHtml(invoice.paymentLabel || 'Online');
    const paymentStatus = escapeHtml((invoice.order?.paymentStatus || 'paid').toUpperCase());

    const logoHtml = logoUrl
      ? `<img class="bp-receipt-logo" src="${escapeHtml(logoUrl)}" alt="" />`
      : '';

    return {
      orderLabel,
      grandTotal: invoice.grandTotal,
      restaurantName,
      html: `
        <div class="bp-receipt-brand">AutoResto</div>
        ${logoHtml}
        <h2 class="bp-receipt-title">${escapeHtml(restaurantName)}</h2>
        <p class="bp-receipt-meta">Order ${escapeHtml(orderLabel)}<br>Table ${escapeHtml(invoice.order?.tableNumber || '—')} · ${escapeHtml(createdAt)}</p>
        <hr class="bp-rule" />
        <div class="bp-items">${itemsHtml}</div>
        <hr class="bp-rule" />
        <div class="bp-totals">${totals.join('')}</div>
        <hr class="bp-rule" />
        <div class="bp-payline">
          <div>Payment: ${paymentLabel}</div>
          <div>Payment Status: ${paymentStatus}</div>
        </div>
        <p class="bp-thanks">Thank you!<br>Visit Again</p>
      `,
    };
  }

  function buildShell({ successTitle, successSubtitle, orderRef }) {
    const root = document.createElement('div');
    root.className = 'bp-experience';
    root.innerHTML = `
      <div class="bp-success-splash" data-bp-splash>
        <div class="bp-success-check" aria-hidden="true">✓</div>
        <h1 data-bp-success-title>${escapeHtml(successTitle)}</h1>
        <p data-bp-success-subtitle>${escapeHtml(successSubtitle)}</p>
        <p class="bp-success-ref" data-bp-success-ref>${escapeHtml(orderRef)}</p>
      </div>

      <div class="bp-scene" data-bp-scene aria-hidden="true">
        <div class="bp-printer-wrap">
          <div class="bp-printer" aria-hidden="true">
            <div class="bp-printer-face">
              <span class="bp-printer-label">Thermal Receipt</span>
              <span class="bp-printer-led"></span>
            </div>
            <div class="bp-printer-slot"></div>
          </div>
          <p class="bp-status" data-bp-status>Preparing your bill...</p>
        </div>
        <div class="bp-paper-track">
          <div class="bp-paper" data-bp-paper>
            <div class="bp-paper-inner" data-bp-paper-inner></div>
          </div>
        </div>
      </div>

      <div class="bp-final bp-hidden" data-bp-final>
        <p class="bp-ready-label">Bill Ready</p>
        <article class="bp-final-card" data-bp-final-card></article>
        <div class="bp-actions bp-hidden" data-bp-actions>
          <button type="button" class="bp-btn bp-btn-primary" data-bp-download>↓ Download Bill</button>
          <button type="button" class="bp-btn" data-bp-share>↗ Share Bill</button>
          <button type="button" class="bp-btn" data-bp-rate>★ Rate Restaurant</button>
        </div>
        <div class="bp-feedback bp-hidden" data-bp-feedback>
          <h3>How was your experience?</h3>
          <div class="bp-stars" data-bp-stars role="group" aria-label="Overall rating">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="bp-star" data-rating="${n}" aria-label="${n} star">★</button>`).join('')}
          </div>
          <textarea class="bp-comment" data-bp-comment maxlength="1000" placeholder="Tell us about your experience..."></textarea>
          <p class="bp-feedback-msg" data-bp-feedback-msg></p>
          <button type="button" class="bp-btn bp-btn-primary" data-bp-submit-feedback>Submit Feedback</button>
        </div>
      </div>
    `;
    return root;
  }

  async function runSequence({
    root,
    invoice,
    paymentMethod = 'online',
    skipAnimation = false,
    orderId,
    onDownload,
    onShare,
    onSubmitReview,
  }) {
    const reduced = prefersReducedMotion();
    const alreadyPlayed = orderId && sessionStorage.getItem(`${ANIMATION_KEY_PREFIX}${orderId}`) === '1';
    const shouldSkip = skipAnimation || alreadyPlayed;

    const sections = buildReceiptSections(invoice);
    const isCash = paymentMethod === 'cash';
    const successTitle = isCash ? 'Cash Collected' : 'Payment Successful!';
    const successSubtitle = isCash
      ? 'Payment received by restaurant.'
      : 'Your payment has been received.';
    const orderRef = `Order ${sections.orderLabel} · ₹${money(sections.grandTotal)}`;

    const splash = root.querySelector('[data-bp-splash]');
    const scene = root.querySelector('[data-bp-scene]');
    const statusEl = root.querySelector('[data-bp-status]');
    const paper = root.querySelector('[data-bp-paper]');
    const paperInner = root.querySelector('[data-bp-paper-inner]');
    const finalBlock = root.querySelector('[data-bp-final]');
    const finalCard = root.querySelector('[data-bp-final-card]');
    const actions = root.querySelector('[data-bp-actions]');
    const feedback = root.querySelector('[data-bp-feedback]');
    const rateBtn = root.querySelector('[data-bp-rate]');
    const downloadBtn = root.querySelector('[data-bp-download]');
    const shareBtn = root.querySelector('[data-bp-share]');
    const starsRoot = root.querySelector('[data-bp-stars]');
    const commentEl = root.querySelector('[data-bp-comment]');
    const feedbackMsg = root.querySelector('[data-bp-feedback-msg]');
    const submitFeedbackBtn = root.querySelector('[data-bp-submit-feedback]');

    splash.querySelector('[data-bp-success-title]').textContent = successTitle;
    splash.querySelector('[data-bp-success-subtitle]').textContent = successSubtitle;
    splash.querySelector('[data-bp-success-ref]').textContent = orderRef;

    paperInner.innerHTML = sections.html;
    finalCard.innerHTML = sections.html;

    let selectedRating = 0;
    let reviewSubmitted = false;

    function showFinal() {
      scene.classList.add('bp-hidden');
      finalBlock.classList.remove('bp-hidden');
      requestAnimationFrame(() => finalBlock.classList.add('bp-visible'));
      actions.classList.remove('bp-hidden');
      requestAnimationFrame(() => actions.classList.add('bp-visible'));
      if (orderId) sessionStorage.setItem(`${ANIMATION_KEY_PREFIX}${orderId}`, '1');
      document.body.classList.remove('ar-bill-printer-active');
    }

    if (shouldSkip) {
      splash.classList.add('bp-hidden');
      showFinal();
    } else if (reduced) {
      document.body.classList.add('ar-bill-printer-active');
      await wait(500);
      splash.classList.add('bp-fade-out');
      await wait(250);
      splash.classList.add('bp-hidden');
      showFinal();
    } else {
      document.body.classList.add('ar-bill-printer-active');
      await wait(500);
      splash.classList.add('bp-fade-out');
      await wait(300);
      splash.classList.add('bp-hidden');
      scene.classList.remove('bp-hidden');
      scene.classList.add('bp-visible');
      await wait(300);
      scene.classList.add('bp-printer-entered');
      await wait(780);
      scene.classList.add('bp-printer-settled');
      scene.classList.add('bp-printer-active');
      statusEl.textContent = 'Printing your bill...';
      await wait(300);
      const targetHeight = Math.max(paperInner.scrollHeight + 4, 120);
      paper.style.setProperty('--bp-paper-height', `${targetHeight}px`);
      scene.classList.add('bp-printing');
      await wait(2800);
      scene.classList.add('bp-settled');
      statusEl.textContent = 'Bill Ready';
      await wait(400);
      showFinal();
    }

    downloadBtn?.addEventListener('click', () => {
      if (typeof onDownload === 'function') onDownload();
    });

    shareBtn?.addEventListener('click', () => {
      if (typeof onShare === 'function') onShare(invoice, sections);
    });

    rateBtn?.addEventListener('click', () => {
      feedback.classList.remove('bp-hidden');
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    starsRoot?.querySelectorAll('.bp-star').forEach((star) => {
      star.addEventListener('click', () => {
        selectedRating = Number(star.dataset.rating || 0);
        starsRoot.querySelectorAll('.bp-star').forEach((btn) => {
          btn.classList.toggle('bp-active', Number(btn.dataset.rating) <= selectedRating);
        });
      });
    });

    submitFeedbackBtn?.addEventListener('click', async () => {
      if (reviewSubmitted) {
        feedbackMsg.textContent = 'Thank you — your feedback was already submitted.';
        return;
      }
      if (selectedRating < 1) {
        feedbackMsg.textContent = 'Please choose a star rating between 1 and 5.';
        return;
      }
      if (typeof onSubmitReview !== 'function') {
        feedbackMsg.textContent = 'Review submission is not available.';
        return;
      }
      try {
        submitFeedbackBtn.disabled = true;
        await onSubmitReview({
          rating: selectedRating,
          comment: commentEl?.value?.trim() || '',
        });
        reviewSubmitted = true;
        feedbackMsg.textContent = 'Thank you for your feedback!';
      } catch (error) {
        if (error?.status === 409) {
          reviewSubmitted = true;
          feedbackMsg.textContent = 'Thank you — your feedback was already submitted.';
        } else {
          feedbackMsg.textContent = error?.message || 'Unable to submit feedback right now.';
          submitFeedbackBtn.disabled = false;
        }
      }
    });
  }

  async function shareBill(invoice, sections, shareUrl) {
    const restaurantName = sections?.restaurantName || invoice.restaurant?.name || 'Restaurant';
    const orderLabel = sections?.orderLabel || invoice.order?.invoiceNumber || `#${invoice.order?.id}`;
    const total = money(sections?.grandTotal ?? invoice.grandTotal);
    const text = `AutoResto Bill\n${restaurantName}\nOrder ${orderLabel}\nTotal ₹${total}`;
    const url = shareUrl || global.location.href;

    if (global.navigator?.share) {
      try {
        await global.navigator.share({
          title: 'AutoResto Bill',
          text,
          url,
        });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    if (global.navigator?.clipboard?.writeText) {
      await global.navigator.clipboard.writeText(`${text}\n${url}`);
      global.alert('Bill details copied to clipboard.');
      return;
    }

    global.prompt('Copy this bill summary:', `${text}\n${url}`);
  }

  function mount(container, options) {
    if (!container) throw new Error('Bill printer container is required');
    container.innerHTML = '';
    const shell = buildShell({
      successTitle: options.paymentMethod === 'cash' ? 'Cash Collected' : 'Payment Successful!',
      successSubtitle: options.paymentMethod === 'cash'
        ? 'Payment received by restaurant.'
        : 'Your payment has been received.',
      orderRef: '',
    });
    container.appendChild(shell);
    return runSequence({ root: shell, ...options });
  }

  global.AutoRestoBillPrinter = {
    mount,
    shareBill,
    prefersReducedMotion,
    buildReceiptSections,
  };
})(window);
