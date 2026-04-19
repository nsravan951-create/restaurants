const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ensureRestaurantAccess } = require('../utils/access');

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

router.get('/:restaurantId', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  const { rows } = await pool.query(
    'SELECT id, name, description, price, image_url, category, is_available FROM menu_items WHERE restaurant_id = $1 ORDER BY category, name',
    [restaurantId]
  );

  return res.json({ menu: rows });
}));

router.get('/:restaurantId/categories/list', requireAuth(['owner', 'super_admin', 'staff', 'kitchen']), asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM menu_items WHERE restaurant_id = $1 ORDER BY category ASC',
    [restaurantId]
  );

  return res.json({ categories: rows.map((row) => row.category) });
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
