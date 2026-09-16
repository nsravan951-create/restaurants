function isMissingTableError(error) {
  return error?.code === '42P01';
}

async function listMenuCategories(pool, restaurantId, { activeOnly = false } = {}) {
  try {
    const params = [restaurantId];
    let sql = `
      SELECT id, restaurant_id, name, display_order, is_active
      FROM menu_categories
      WHERE restaurant_id = $1
    `;
    if (activeOnly) {
      sql += ' AND is_active = TRUE';
    }
    sql += ' ORDER BY display_order ASC, name ASC';
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function backfillCategoriesFromMenuItems(pool, restaurantId) {
  const existing = await listMenuCategories(pool, restaurantId);
  if (existing.length) return existing;

  const { rows: itemRows } = await pool.query(
    `SELECT DISTINCT category
     FROM menu_items
     WHERE restaurant_id = $1 AND category IS NOT NULL AND TRIM(category) <> ''
     ORDER BY category ASC`,
    [restaurantId]
  );
  if (!itemRows.length) return [];

  try {
    const inserted = [];
    for (let i = 0; i < itemRows.length; i += 1) {
      const name = String(itemRows[i].category).trim();
      const result = await pool.query(
        `INSERT INTO menu_categories (restaurant_id, name, display_order, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (restaurant_id, name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id, restaurant_id, name, display_order, is_active`,
        [restaurantId, name, i]
      );
      inserted.push(result.rows[0]);
    }
    return inserted;
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function getPublicMenuCategories(pool, restaurantId) {
  let categories = await listMenuCategories(pool, restaurantId, { activeOnly: true });
  if (!categories.length) {
    categories = await backfillCategoriesFromMenuItems(pool, restaurantId);
    categories = categories.filter((row) => row.is_active);
  }
  return categories;
}

function orderMenuByCategories(menuItems, categories) {
  if (!categories.length) return menuItems;
  const orderMap = new Map(categories.map((row, index) => [row.name, index]));
  return [...menuItems].sort((a, b) => {
    const aOrder = orderMap.has(a.category) ? orderMap.get(a.category) : 9999;
    const bOrder = orderMap.has(b.category) ? orderMap.get(b.category) : 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name).localeCompare(String(b.name));
  });
}

function filterMenuByActiveCategories(menuItems, categories) {
  if (!categories.length) return menuItems;
  const activeNames = new Set(categories.filter((row) => row.is_active).map((row) => row.name));
  return menuItems.filter((item) => activeNames.has(item.category));
}

module.exports = {
  listMenuCategories,
  backfillCategoriesFromMenuItems,
  getPublicMenuCategories,
  orderMenuByCategories,
  filterMenuByActiveCategories,
  isMissingTableError,
};
