const express = require('express');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { ensureRestaurantAccess } = require('../utils/access');
const { requireFeature } = require('../utils/featureAccess');
const { writeAuditLog } = require('../utils/auditLog');

const router = express.Router();

const ingredientSchema = z.object({
  restaurantId: z.number().int().positive(),
  name: z.string().min(1),
  unit: z.string().min(1).default('unit'),
  currentStock: z.number().nonnegative().default(0),
  lowStockThreshold: z.number().nonnegative().default(0),
});

const txSchema = z.object({
  restaurantId: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  transactionType: z.enum(['stock_in', 'stock_out', 'adjustment', 'consumption']),
  quantity: z.number().positive(),
  notes: z.string().optional().default(''),
  referenceType: z.string().max(40).optional().default(''),
  referenceId: z.number().int().positive().optional(),
  idempotencyKey: z.string().max(120).optional(),
});

router.use(requireAuth(['owner', 'super_admin']));
router.use(requireFeature('inventory'));

router.get('/restaurant/:restaurantId/ingredients', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, name, unit, current_stock, low_stock_threshold,
            (current_stock <= low_stock_threshold) AS is_low_stock,
            created_at, updated_at
     FROM ingredients WHERE restaurant_id = $1 ORDER BY name ASC`,
    [restaurantId]
  );
  return res.json({ ingredients: rows });
}));

router.get('/restaurant/:restaurantId/low-stock', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);
  const { rows } = await pool.query(
    `SELECT id, name, unit, current_stock, low_stock_threshold,
            (low_stock_threshold - current_stock)::numeric AS shortage
     FROM ingredients
     WHERE restaurant_id = $1 AND current_stock <= low_stock_threshold
     ORDER BY shortage DESC, name ASC`,
    [restaurantId]
  );
  return res.json({ ingredients: rows });
}));

router.post('/ingredients', asyncHandler(async (req, res) => {
  const data = ingredientSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    currentStock: Number(req.body.currentStock || 0),
    lowStockThreshold: Number(req.body.lowStockThreshold || 0),
  });
  await ensureRestaurantAccess(req.user, data.restaurantId);

  const { rows } = await pool.query(
    `INSERT INTO ingredients (restaurant_id, name, unit, current_stock, low_stock_threshold)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [data.restaurantId, data.name, data.unit, data.currentStock, data.lowStockThreshold]
  );
  return res.status(201).json({ message: 'Ingredient created', ingredientId: rows[0].id });
}));

router.patch('/ingredients/:ingredientId', asyncHandler(async (req, res) => {
  const ingredientId = Number(req.params.ingredientId);
  const name = String(req.body?.name || '').trim();
  const unit = String(req.body?.unit || '').trim();
  const lowStockThreshold = Number(req.body?.lowStockThreshold);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0 || !name || !unit
    || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    return res.status(400).json({ message: 'Name, unit, and a valid low-stock threshold are required.' });
  }

  const { rows: existing } = await pool.query(
    'SELECT restaurant_id FROM ingredients WHERE id = $1 LIMIT 1',
    [ingredientId]
  );
  if (!existing.length) return res.status(404).json({ message: 'Ingredient not found' });
  await ensureRestaurantAccess(req.user, existing[0].restaurant_id);

  const { rows } = await pool.query(
    `UPDATE ingredients
     SET name = $1, unit = $2, low_stock_threshold = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING id, name, unit, current_stock, low_stock_threshold, updated_at`,
    [name, unit, lowStockThreshold, ingredientId]
  );
  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: existing[0].restaurant_id,
    action: 'inventory_ingredient_updated',
    resourceType: 'ingredient',
    resourceId: ingredientId,
    metadata: { name, unit, lowStockThreshold },
  });
  return res.json({ message: 'Ingredient updated', ingredient: rows[0] });
}));

router.post('/transactions', asyncHandler(async (req, res) => {
  const data = txSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    ingredientId: Number(req.body.ingredientId),
    quantity: Number(req.body.quantity),
    referenceId: req.body.referenceId ? Number(req.body.referenceId) : undefined,
  });
  await ensureRestaurantAccess(req.user, data.restaurantId);

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows: ingRows } = await conn.query(
      'SELECT id, unit, current_stock FROM ingredients WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
      [data.ingredientId, data.restaurantId]
    );
    if (!ingRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Ingredient not found' });
    }

    if (data.idempotencyKey) {
      const { rows: existingTx } = await conn.query(
        `SELECT id, quantity FROM inventory_transactions
         WHERE restaurant_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [data.restaurantId, data.idempotencyKey]
      );
      if (existingTx.length) {
        await conn.query('ROLLBACK');
        return res.status(200).json({ message: 'Inventory transaction already recorded', transactionId: existingTx[0].id, currentStock: ingRows[0].current_stock });
      }
    }

    const delta = ['stock_out', 'consumption'].includes(data.transactionType)
      ? -data.quantity
      : data.quantity;

    const nextStock = Number(ingRows[0].current_stock) + delta;
    if (nextStock < 0) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient stock' });
    }

    await conn.query(
      `INSERT INTO inventory_transactions
         (restaurant_id, ingredient_id, transaction_type, quantity, unit, reference_type, reference_id, idempotency_key, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.restaurantId, data.ingredientId, data.transactionType, data.quantity, ingRows[0].unit,
        data.referenceType, data.referenceId || null, data.idempotencyKey || null, data.notes, req.user.userId]
    );

    await conn.query(
      'UPDATE ingredients SET current_stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextStock, data.ingredientId]
    );

    await conn.query('COMMIT');

    await writeAuditLog({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      restaurantId: data.restaurantId,
      action: 'inventory_adjustment',
      resourceType: 'ingredient',
      resourceId: data.ingredientId,
      metadata: { transactionType: data.transactionType, quantity: data.quantity, nextStock },
    });

    return res.status(201).json({ message: 'Inventory updated', currentStock: nextStock });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

router.get('/restaurant/:restaurantId/transactions', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT t.id, t.ingredient_id, i.name AS ingredient_name, t.transaction_type,
            t.quantity, t.unit, t.reference_type, t.reference_id, t.notes, t.created_at
     FROM inventory_transactions t
     INNER JOIN ingredients i ON i.id = t.ingredient_id
     WHERE t.restaurant_id = $1
     ORDER BY t.created_at DESC
     LIMIT 200`,
    [restaurantId]
  );
  return res.json({ transactions: rows });
}));

router.get('/restaurant/:restaurantId/recipes', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);
  const { rows } = await pool.query(
    `SELECT r.id, r.menu_item_id, m.name AS menu_item_name,
            COALESCE(json_agg(json_build_object(
              'ingredientId', ri.ingredient_id,
              'ingredientName', i.name,
              'unit', i.unit,
              'quantity', ri.quantity
            ) ORDER BY i.name) FILTER (WHERE ri.ingredient_id IS NOT NULL), '[]'::json) AS items
     FROM recipes r
     INNER JOIN menu_items m ON m.id = r.menu_item_id
     LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE r.restaurant_id = $1
     GROUP BY r.id, r.menu_item_id, m.name
     ORDER BY m.name ASC`,
    [restaurantId]
  );
  return res.json({ recipes: rows });
}));

router.put('/recipes', asyncHandler(async (req, res) => {
  const restaurantId = Number(req.body?.restaurantId);
  const menuItemId = Number(req.body?.menuItemId);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!Number.isInteger(restaurantId) || restaurantId <= 0
    || !Number.isInteger(menuItemId) || menuItemId <= 0 || !items.length) {
    return res.status(400).json({ message: 'A menu item and at least one ingredient are required.' });
  }
  await ensureRestaurantAccess(req.user, restaurantId);

  const normalizedItems = items.map((item) => ({
    ingredientId: Number(item.ingredientId),
    quantity: Number(item.quantity),
  }));
  if (normalizedItems.some((item) => !Number.isInteger(item.ingredientId) || item.ingredientId <= 0
    || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return res.status(400).json({ message: 'Recipe quantities must be positive numbers.' });
  }

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: menuRows } = await conn.query(
      'SELECT id FROM menu_items WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
      [menuItemId, restaurantId]
    );
    if (!menuRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Menu item not found.' });
    }
    const ingredientIds = [...new Set(normalizedItems.map((item) => item.ingredientId))];
    const { rows: ingredientRows } = await conn.query(
      `SELECT id FROM ingredients
       WHERE restaurant_id = $1 AND id = ANY($2::int[])`,
      [restaurantId, ingredientIds]
    );
    if (ingredientRows.length !== ingredientIds.length) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ message: 'Every recipe ingredient must belong to this restaurant.' });
    }

    const { rows: recipeRows } = await conn.query(
      `INSERT INTO recipes (restaurant_id, menu_item_id)
       VALUES ($1, $2)
       ON CONFLICT (menu_item_id) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id
       RETURNING id`,
      [restaurantId, menuItemId]
    );
    const recipeId = recipeRows[0].id;
    await conn.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipeId]);
    for (const item of normalizedItems) {
      await conn.query(
        `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity)
         VALUES ($1, $2, $3)`,
        [recipeId, item.ingredientId, item.quantity]
      );
    }
    await conn.query('COMMIT');

    await writeAuditLog({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      restaurantId,
      action: 'recipe_saved',
      resourceType: 'recipe',
      resourceId: recipeId,
      metadata: { menuItemId, ingredientCount: normalizedItems.length },
    });
    return res.status(201).json({ message: 'Recipe saved', recipeId });
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}));

module.exports = router;
