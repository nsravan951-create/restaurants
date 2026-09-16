const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ensureRestaurantAccess } = require('../utils/access');
const {
  listMenuCategories,
  backfillCategoriesFromMenuItems,
  getPublicMenuCategories,
  orderMenuByCategories,
  filterMenuByActiveCategories,
  isMissingTableError,
} = require('../utils/menuCategories');

const router = express.Router();

const menuSchema = z.object({
  restaurantId: z.number(),
  name: z.string().min(2),
  description: z.string().optional().default(''),
  price: z.number().positive(),
  imageUrl: z.string().url().optional().or(z.literal('')).default(''),
  category: z.string().min(2),
  isAvailable: z.boolean().optional().default(true),
});

router.get('/', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.query.restaurantId || 0);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return res.status(400).json({ message: 'restaurantId query parameter is required' });
  }

  const { rows } = await pool.query(
    'SELECT id, restaurant_id, name, description, price, image_url, category, is_available FROM menu_items WHERE restaurant_id = $1 AND is_available = TRUE ORDER BY category, name',
    [restaurantId]
  );
  const foodCategories = await getPublicMenuCategories(pool, restaurantId);
  const menu = orderMenuByCategories(filterMenuByActiveCategories(rows, foodCategories), foodCategories);

  return res.json({ menu, foodCategories });
}));

router.get('/:restaurantId', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  const { rows } = await pool.query(
    'SELECT id, name, description, price, image_url, category, is_available FROM menu_items WHERE restaurant_id = $1 ORDER BY category, name',
    [restaurantId]
  );

  return res.json({ menu: rows });
}));

router.get('/:restaurantId/categories/public', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return res.status(400).json({ message: 'Invalid restaurant ID' });
  }
  const categories = await getPublicMenuCategories(pool, restaurantId);
  return res.json({ categories });
}));

router.get('/:restaurantId/categories', requireAuth(['owner', 'super_admin', 'staff', 'kitchen']), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  await ensureRestaurantAccess(req.user, restaurantId);
  let categories = await listMenuCategories(pool, restaurantId);
  if (!categories.length) {
    categories = await backfillCategoriesFromMenuItems(pool, restaurantId);
  }
  return res.json({ categories });
}));

router.get('/:restaurantId/categories/list', requireAuth(['owner', 'super_admin', 'staff', 'kitchen']), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  await ensureRestaurantAccess(req.user, restaurantId);
  const categories = await listMenuCategories(pool, restaurantId);
  if (categories.length) {
    return res.json({ categories: categories.map((row) => row.name) });
  }
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM menu_items WHERE restaurant_id = $1 ORDER BY category ASC',
    [restaurantId]
  );
  return res.json({ categories: rows.map((row) => row.category) });
}));

router.post('/:restaurantId/categories', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const name = String(req.body?.name || '').trim();
  const displayOrder = Number(req.body?.displayOrder ?? req.body?.display_order ?? 0);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0 || name.length < 2) {
    return res.status(400).json({ message: 'Valid restaurantId and category name are required' });
  }
  await ensureRestaurantAccess(req.user, restaurantId);

  try {
    const { rows } = await pool.query(
      `INSERT INTO menu_categories (restaurant_id, name, display_order, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id, restaurant_id, name, display_order, is_active`,
      [restaurantId, name, Number.isFinite(displayOrder) ? displayOrder : 0]
    );
    return res.status(201).json({ message: 'Category created', category: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Category already exists for this restaurant' });
    }
    if (isMissingTableError(error)) {
      return res.status(503).json({ message: 'Category management is not available until migration 010 is applied' });
    }
    throw error;
  }
}));

router.patch('/:restaurantId/categories/:categoryId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const categoryId = Number(req.params.categoryId);
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows: existing } = await pool.query(
    'SELECT id, name FROM menu_categories WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
    [categoryId, restaurantId]
  );
  if (!existing.length) return res.status(404).json({ message: 'Category not found' });

  const oldName = existing[0].name;
  const newName = req.body?.name !== undefined ? String(req.body.name).trim() : oldName;
  const displayOrder = req.body?.displayOrder ?? req.body?.display_order;
  const isActive = req.body?.isActive ?? req.body?.is_active;

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(
      `UPDATE menu_categories
       SET name = $1,
           display_order = COALESCE($2, display_order),
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND restaurant_id = $5`,
      [
        newName || oldName,
        displayOrder !== undefined ? Number(displayOrder) : null,
        isActive !== undefined ? Boolean(isActive) : null,
        categoryId,
        restaurantId,
      ]
    );
    if (newName && newName !== oldName) {
      await conn.query(
        'UPDATE menu_items SET category = $1 WHERE restaurant_id = $2 AND category = $3',
        [newName, restaurantId, oldName]
      );
    }
    await conn.query('COMMIT');
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }

  const { rows } = await pool.query(
    'SELECT id, restaurant_id, name, display_order, is_active FROM menu_categories WHERE id = $1',
    [categoryId]
  );
  return res.json({ message: 'Category updated', category: rows[0] });
}));

router.delete('/:restaurantId/categories/:categoryId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const restaurantId = Number(req.params.restaurantId);
  const categoryId = Number(req.params.categoryId);
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows: existing } = await pool.query(
    'SELECT id, name FROM menu_categories WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
    [categoryId, restaurantId]
  );
  if (!existing.length) return res.status(404).json({ message: 'Category not found' });

  const { rows: itemRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM menu_items WHERE restaurant_id = $1 AND category = $2',
    [restaurantId, existing[0].name]
  );
  if (itemRows[0]?.count > 0) {
    return res.status(409).json({
      message: 'Cannot delete a category that still has menu items. Reassign or remove those items first.',
      itemCount: itemRows[0].count,
    });
  }

  await pool.query('DELETE FROM menu_categories WHERE id = $1 AND restaurant_id = $2', [categoryId, restaurantId]);
  return res.json({ message: 'Category deleted' });
}));

router.post('/', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const parsed = menuSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    price: Number(req.body.price),
  });

  await ensureRestaurantAccess(req.user, parsed.restaurantId);

  const result = await pool.query(
    `INSERT INTO menu_items (restaurant_id, name, description, price, image_url, category, is_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [parsed.restaurantId, parsed.name, parsed.description, parsed.price, parsed.imageUrl, parsed.category, parsed.isAvailable]
  );

  return res.status(201).json({ message: 'Menu item created', itemId: result.rows[0].id });
}));

router.put('/:itemId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const { rows: itemRows } = await pool.query('SELECT id, restaurant_id FROM menu_items WHERE id = $1', [itemId]);
  if (!itemRows.length) return res.status(404).json({ message: 'Menu item not found' });

  await ensureRestaurantAccess(req.user, itemRows[0].restaurant_id);

  const updates = {
    name: req.body.name,
    description: req.body.description,
    price: req.body.price !== undefined ? Number(req.body.price) : undefined,
    image_url: req.body.imageUrl,
    category: req.body.category,
    is_available: req.body.isAvailable !== undefined ? req.body.isAvailable : undefined,
  };

  const fields = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!fields.length) return res.status(400).json({ message: 'No fields to update' });

  const setClause = fields.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = fields.map(([, value]) => value);
  values.push(itemId);

  await pool.query(`UPDATE menu_items SET ${setClause} WHERE id = $${values.length}`, values);

  return res.json({ message: 'Menu item updated' });
}));

router.delete('/:itemId', requireAuth(['owner', 'super_admin']), asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const { rows: itemRows } = await pool.query('SELECT id, restaurant_id FROM menu_items WHERE id = $1', [itemId]);
  if (!itemRows.length) return res.status(404).json({ message: 'Menu item not found' });

  await ensureRestaurantAccess(req.user, itemRows[0].restaurant_id);

  await pool.query('DELETE FROM menu_items WHERE id = $1', [itemId]);
  return res.json({ message: 'Menu item deleted' });
}));

module.exports = router;
