function sortInlineAds(ads) {
  return [...ads].sort((left, right) => {
    const orderDiff = Number(left.display_order || 0) - Number(right.display_order || 0);
    if (orderDiff !== 0) return orderDiff;
    return Number(right.id || 0) - Number(left.id || 0);
  });
}

function parseTargetRestaurantIds(value) {
  if (Array.isArray(value)) {
    return value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  }
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      return parseTargetRestaurantIds(JSON.parse(value));
    } catch (error) {
      return [];
    }
  }
  return [];
}

function isInlineAdEligibleForRestaurant(ad, restaurantId) {
  const scopedRestaurantId = Number(restaurantId);
  if (!Number.isInteger(scopedRestaurantId) || scopedRestaurantId <= 0) return false;

  const targetScope = ad.target_scope || 'all';
  const targetRestaurantIds = parseTargetRestaurantIds(ad.target_restaurant_ids);

  if (targetScope === 'selected') {
    if (targetRestaurantIds.length) {
      return targetRestaurantIds.includes(scopedRestaurantId);
    }
    if (ad.restaurant_id) {
      return Number(ad.restaurant_id) === scopedRestaurantId;
    }
    return false;
  }

  if (ad.restaurant_id) {
    return Number(ad.restaurant_id) === scopedRestaurantId;
  }

  return true;
}

function resolveInlineFrequency(ads, fallback = 3) {
  const sorted = sortInlineAds(ads);
  const frequency = Number(sorted[0]?.inline_frequency);
  if (frequency >= 2 && frequency <= 6) return frequency;
  return fallback;
}

function adsForSlot(allAds, slotIndex) {
  const sorted = sortInlineAds(allAds);
  if (!sorted.length) return [];
  const start = (slotIndex - 1) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

function buildInlineMenuStream(items, ads, frequency) {
  const stream = [];
  let slotIndex = 0;

  items.forEach((item, index) => {
    stream.push({ type: 'food', item });

    if (!ads.length) return;
    if ((index + 1) % frequency !== 0) return;

    slotIndex += 1;
    stream.push({
      type: 'ad',
      slotIndex,
      ads: adsForSlot(ads, slotIndex),
    });
  });

  return stream;
}

function formatInlineAd(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    imageUrl: row.image_url,
    mobileImageUrl: row.mobile_image_url || row.image_url,
    videoUrl: row.video_url,
    mediaType: row.media_type || 'image',
    targetLink: row.target_link,
    ctaText: row.cta_text || 'Order Now',
    displayMode: row.display_mode || 'inline',
    displayOrder: Number(row.display_order || 0),
    inlineFrequency: Number(row.inline_frequency || 3),
    restaurantId: row.restaurant_id,
    targetScope: row.target_scope || 'all',
    targetRestaurantIds: parseTargetRestaurantIds(row.target_restaurant_ids),
  };
}

async function fetchActiveInlineAds(pool, restaurantId) {
  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.title,
       a.description,
       a.image_url,
       a.mobile_image_url,
       a.video_url,
       a.media_type,
       a.target_link,
       a.cta_text,
       a.display_mode,
       a.display_order,
       a.inline_frequency,
       a.restaurant_id,
       a.target_scope,
       COALESCE(
         json_agg(art.restaurant_id) FILTER (WHERE art.restaurant_id IS NOT NULL),
         '[]'::json
       ) AS target_restaurant_ids
     FROM ads a
     LEFT JOIN ad_restaurant_targets art ON art.ad_id = a.id
     WHERE a.is_active = TRUE
       AND a.display_mode IN ('inline', 'vertical')
       AND (a.starts_at IS NULL OR a.starts_at <= NOW())
       AND (a.ends_at IS NULL OR a.ends_at >= NOW())
     GROUP BY a.id
     ORDER BY a.display_order ASC, a.id DESC`
  );

  return rows
    .filter((row) => isInlineAdEligibleForRestaurant(row, restaurantId))
    .map(formatInlineAd);
}

async function replaceAdRestaurantTargets(pool, adId, restaurantIds = []) {
  await pool.query('DELETE FROM ad_restaurant_targets WHERE ad_id = $1', [adId]);
  const uniqueIds = [...new Set(restaurantIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return;

  const values = uniqueIds.map((restaurantId, index) => `($1, $${index + 2})`).join(', ');
  await pool.query(
    `INSERT INTO ad_restaurant_targets (ad_id, restaurant_id) VALUES ${values}`,
    [adId, ...uniqueIds]
  );
}

async function fetchAdRestaurantTargets(pool, adId) {
  const { rows } = await pool.query(
    'SELECT restaurant_id FROM ad_restaurant_targets WHERE ad_id = $1 ORDER BY restaurant_id ASC',
    [adId]
  );
  return rows.map((row) => Number(row.restaurant_id));
}

module.exports = {
  sortInlineAds,
  isInlineAdEligibleForRestaurant,
  resolveInlineFrequency,
  adsForSlot,
  buildInlineMenuStream,
  formatInlineAd,
  fetchActiveInlineAds,
  replaceAdRestaurantTargets,
  fetchAdRestaurantTargets,
  parseTargetRestaurantIds,
};
