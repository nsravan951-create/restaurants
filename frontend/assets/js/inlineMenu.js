(function initInlineMenu(global) {
  const carouselControllers = new Map();
  const impressedAds = new Set();
  let paused = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveInlineFrequency(ads, fallback = 3) {
    if (!ads.length) return fallback;
    const sorted = [...ads].sort((left, right) => {
      const orderDiff = Number(left.displayOrder || left.display_order || 0) - Number(right.displayOrder || right.display_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(right.id || 0) - Number(left.id || 0);
    });
    const frequency = Number(sorted[0].inlineFrequency || sorted[0].inline_frequency);
    return frequency >= 2 && frequency <= 6 ? frequency : fallback;
  }

  function adsForSlot(allAds, slotIndex) {
    const sorted = [...allAds].sort((left, right) => {
      const orderDiff = Number(left.displayOrder || left.display_order || 0) - Number(right.displayOrder || right.display_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(right.id || 0) - Number(left.id || 0);
    });
    if (!sorted.length) return [];
    const start = (slotIndex - 1) % sorted.length;
    return [...sorted.slice(start), ...sorted.slice(0, start)];
  }

  function buildCategoryStream(items, ads, frequency) {
    const stream = [];
    let slotIndex = 0;

    items.forEach((item, index) => {
      stream.push({ type: 'food', item });
      if (!ads.length) return;
      if ((index + 1) % frequency !== 0) return;
      slotIndex += 1;
      stream.push({ type: 'ad', slotIndex, ads: adsForSlot(ads, slotIndex) });
    });

    return stream;
  }

  function chunkFoodRow(items) {
    const rows = [];
    let current = [];

    items.forEach((entry) => {
      if (entry.type === 'ad') {
        if (current.length) {
          rows.push({ type: 'food-row', items: current });
          current = [];
        }
        rows.push(entry);
        return;
      }
      current.push(entry.item);
    });

    if (current.length) rows.push({ type: 'food-row', items: current });
    return rows;
  }

  function renderFoodCard(item, helpers) {
    const image = item.image_url
      ? `<img class="food-card-h__image" src="${escapeHtml(helpers.normalizeUrl(item.image_url))}" alt="${escapeHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer" />`
      : '<div class="food-card-h__placeholder" aria-hidden="true">🍽</div>';

    return `
      <article class="food-card-h" data-food-id="${item.id}">
        <div class="food-card-h__image-wrap">${image}</div>
        <h4 class="food-card-h__name">${escapeHtml(item.name)}</h4>
        ${item.description ? `<p class="food-card-h__desc">${escapeHtml(item.description)}</p>` : ''}
        <div class="food-card-h__footer">
          <span class="food-card-h__price">₹${escapeHtml(helpers.money(item.price))}</span>
          <button class="food-card-h__add" type="button" data-add-item="${item.id}" aria-label="Add ${escapeHtml(item.name)} to cart">+ ADD</button>
        </div>
      </article>
    `;
  }

  function renderFoodRow(items, helpers, rowId) {
    return `
      <div class="food-row-wrap" data-food-row="${rowId}">
        <p class="food-row-hint">Swipe for more items</p>
        <button class="row-nav row-nav--prev" type="button" aria-label="Scroll food left" data-row-prev="${rowId}">‹</button>
        <div class="food-row" data-row-scroll="${rowId}">
          ${items.map((item) => renderFoodCard(item, helpers)).join('')}
        </div>
        <button class="row-nav row-nav--next" type="button" aria-label="Scroll food right" data-row-next="${rowId}">›</button>
      </div>
    `;
  }

  function renderAdSlide(ad, helpers) {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const imageUrl = (isMobile && (ad.mobileImageUrl || ad.mobile_image_url))
      ? (ad.mobileImageUrl || ad.mobile_image_url)
      : (ad.imageUrl || ad.image_url);
    const mediaType = ad.mediaType || ad.media_type || 'image';
    const videoUrl = ad.videoUrl || ad.video_url;
    const media = mediaType === 'video' && videoUrl
      ? `<video src="${escapeHtml(videoUrl)}" muted loop playsinline autoplay></video>`
      : `<img src="${escapeHtml(helpers.normalizeUrl(imageUrl))}" alt="${escapeHtml(ad.title)}" loading="lazy" referrerpolicy="no-referrer" />`;

    const ctaText = ad.ctaText || ad.cta_text || 'Order Now';
    const targetLink = ad.targetLink || ad.target_link || '#';

    return `
      <article class="inline-ad-slide" data-ad-id="${ad.id}">
        <div class="inline-ad-media">${media}</div>
        <div class="inline-ad-copy">
          <h4>${escapeHtml(ad.title)}</h4>
          ${ad.description ? `<p>${escapeHtml(ad.description)}</p>` : ''}
          <a class="inline-ad-cta" href="${escapeHtml(targetLink)}" target="_blank" rel="noopener noreferrer" data-ad-cta="${ad.id}">${escapeHtml(ctaText)}</a>
        </div>
      </article>
    `;
  }

  function renderAdSlot(slotIndex, ads, helpers) {
    const slotId = `ad-slot-${slotIndex}`;
    return `
      <section class="inline-ad-slot" data-inline-ad-slot="${slotId}" aria-label="Sponsored promotion">
        <span class="inline-ad-slot__badge">Sponsored</span>
        <div class="inline-ad-carousel" data-carousel="${slotId}">
          <div class="inline-ad-track" data-carousel-track="${slotId}">
            ${ads.map((ad) => renderAdSlide(ad, helpers)).join('')}
          </div>
          <div class="inline-ad-dots" data-carousel-dots="${slotId}">
            ${ads.map((ad, index) => `<button class="inline-ad-dot${index === 0 ? ' is-active' : ''}" type="button" aria-label="Show promotion ${index + 1}" data-carousel-dot="${slotId}" data-index="${index}"></button>`).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderCategorySection(category, items, inlineAds, helpers) {
    const frequency = resolveInlineFrequency(inlineAds, 3);
    const stream = buildCategoryStream(items, inlineAds, frequency);
    const rows = chunkFoodRow(stream);
    let foodRowIndex = 0;

    const body = rows.map((row) => {
      if (row.type === 'ad') {
        return renderAdSlot(row.slotIndex, row.ads, helpers);
      }
      foodRowIndex += 1;
      return renderFoodRow(row.items, helpers, `${helpers.slugifyCategory(category)}-${foodRowIndex}`);
    }).join('');

    return `
      <section class="category-section" id="category-section-${helpers.slugifyCategory(category)}">
        <h3 class="category-title">${escapeHtml(category)}</h3>
        <div class="food-stream">${body}</div>
      </section>
    `;
  }

  async function trackImpression(apiBaseUrl, adId, restaurantId) {
    const key = `${adId}:${restaurantId || 'global'}`;
    if (impressedAds.has(key)) return;
    impressedAds.add(key);
    try {
      await fetch(`${apiBaseUrl}/api/ads/impression/${adId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
    } catch (error) {
      impressedAds.delete(key);
    }
  }

  async function trackClick(apiBaseUrl, adId, restaurantId) {
    try {
      await fetch(`${apiBaseUrl}/api/ads/click/${adId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
    } catch (error) {
      console.warn('[AutoResto] Failed to track ad click:', error.message);
    }
  }

  function destroyCarousels() {
    carouselControllers.forEach((controller) => controller.destroy());
    carouselControllers.clear();
  }

  function initCarousel(slotId, options) {
    const root = options.container.querySelector(`[data-carousel="${slotId}"]`);
    if (!root) return;

    const track = root.querySelector(`[data-carousel-track="${slotId}"]`);
    const dots = root.querySelectorAll(`[data-carousel-dot="${slotId}"]`);
    const slides = track ? track.children.length : 0;
    if (!track || slides <= 1) return;

    let index = 0;
    let timer = null;
    let resumeTimer = null;

    const setIndex = (nextIndex) => {
      index = ((nextIndex % slides) + slides) % slides;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === index);
      });
      const activeSlide = track.children[index];
      const adId = activeSlide?.dataset?.adId;
      if (adId) {
        trackImpression(options.apiBaseUrl, adId, options.restaurantId);
      }
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const start = () => {
      if (paused || slides <= 1) return;
      stop();
      timer = setInterval(() => setIndex(index + 1), 5000);
    };

    const pauseTemporarily = () => {
      stop();
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => start(), 8000);
    };

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        setIndex(Number(dot.dataset.index || 0));
        pauseTemporarily();
      });
    });

    root.addEventListener('touchstart', pauseTemporarily, { passive: true });
    root.addEventListener('mousedown', pauseTemporarily);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          const activeSlide = track.children[index];
          const adId = activeSlide?.dataset?.adId;
          if (adId) trackImpression(options.apiBaseUrl, adId, options.restaurantId);
          if (!paused) start();
        } else {
          stop();
        }
      });
    }, { threshold: [0.45] });

    observer.observe(root);
    setIndex(0);

    const controller = {
      start,
      stop,
      destroy() {
        stop();
        if (resumeTimer) clearTimeout(resumeTimer);
        observer.disconnect();
      },
    };

    carouselControllers.set(slotId, controller);
  }

  function bindInteractions(container, options) {
    container.querySelectorAll('[data-add-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = options.menuItems.find((menuItem) => Number(menuItem.id) === Number(button.dataset.addItem));
        if (!item) return;
        button.classList.add('added');
        setTimeout(() => button.classList.remove('added'), 180);
        options.onAddToCart(item);
      });
    });

    container.querySelectorAll('[data-row-prev]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = container.querySelector(`[data-row-scroll="${button.dataset.rowPrev}"]`);
        row?.scrollBy({ left: -240, behavior: 'smooth' });
      });
    });

    container.querySelectorAll('[data-row-next]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = container.querySelector(`[data-row-scroll="${button.dataset.rowNext}"]`);
        row?.scrollBy({ left: 240, behavior: 'smooth' });
      });
    });

    container.querySelectorAll('[data-ad-cta]').forEach((link) => {
      link.addEventListener('click', () => {
        trackClick(options.apiBaseUrl, link.dataset.adCta, options.restaurantId);
      });
    });

    container.querySelectorAll('[data-inline-ad-slot]').forEach((slot) => {
      const slotId = slot.dataset.inlineAdSlot;
      initCarousel(slotId, options);
    });
  }

  function render(options) {
    destroyCarousels();

    const {
      container,
      categories,
      menuItems,
      selectedCategory,
      inlineAds = [],
      helpers,
      apiBaseUrl,
      restaurantId,
      onAddToCart,
    } = options;

    const visibleCategories = selectedCategory === 'all'
      ? categories
      : categories.filter(([category]) => category === selectedCategory);

    if (!visibleCategories.length) {
      container.innerHTML = '<div class="empty">No menu items available for this category.</div>';
      return;
    }

    container.innerHTML = visibleCategories.map(([category, items]) => (
      renderCategorySection(category, items, inlineAds, helpers)
    )).join('');

    bindInteractions(container, {
      menuItems,
      onAddToCart,
      apiBaseUrl,
      restaurantId,
      container,
    });
  }

  function pauseAll() {
    paused = true;
    carouselControllers.forEach((controller) => controller.stop());
  }

  function resumeAll() {
    paused = false;
    carouselControllers.forEach((controller) => controller.start());
  }

  global.InlineMenu = {
    render,
    pauseAll,
    resumeAll,
    destroyAll: destroyCarousels,
    buildCategoryStream,
    resolveInlineFrequency,
  };
})(window);
