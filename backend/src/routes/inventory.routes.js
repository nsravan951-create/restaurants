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
});

router.use(requireAuth(['owner', 'super_admin']));
router.use(requireFeature('inventory'));

router.get('/restaurant/:restaurantId/ingredients', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  await ensureRestaurantAccess(req.user, restaurantId);

  const { rows } = await pool.query(
    `SELECT id, name, unit, current_stock, low_stock_threshold, created_at, updated_at
     FROM ingredients WHERE restaurant_id = $1 ORDER BY name ASC`,
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

router.post('/transactions', asyncHandler(async (req, res) => {
  const data = txSchema.parse({
    ...req.body,
    restaurantId: Number(req.body.restaurantId),
    ingredientId: Number(req.body.ingredientId),
    quantity: Number(req.body.quantity),
  });
  await ensureRestaurantAccess(req.user, data.restaurantId);

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows: ingRows } = await conn.query(
      'SELECT id, current_stock FROM ingredients WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
      [data.ingredientId, data.restaurantId]
    );
    if (!ingRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ message: 'Ingredient not found' });
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
         (restaurant_id, ingredient_id, transaction_type, quantity, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.restaurantId, data.ingredientId, data.transactionType, data.quantity, data.notes, req.user.userId]
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
    `SELECT t.id, t.ingredient_id, i.name AS ingredient_name, t.transaction_type, t.quantity, t.notes, t.created_at
     FROM inventory_transactions t
     INNER JOIN ingredients i ON i.id = t.ingredient_id
     WHERE t.restaurant_id = $1
     ORDER BY t.created_at DESC
     LIMIT 200`,
    [restaurantId]
  );
  return res.json({ transactions: rows });
}));

module.exports = router;
