const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { buildQrPayload } = require('../utils/qr');

const router = express.Router();

const ownerRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  restaurantName: z.string().min(2),
  totalTables: z.number().int().positive().max(500),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );
}

router.post('/register-owner', asyncHandler(async (req, res) => {
  console.log('BODY:', req.body);

  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const data = ownerRegisterSchema.parse({
    ...req.body,
    totalTables: Number(req.body.totalTables),
  });
  const conn = await pool.connect();

  try {
    const { rows: existing } = await conn.query('SELECT id FROM users WHERE email = $1', [data.email]);
    console.log('REGISTER existing user count:', existing.length);
    if (existing.length) {
      return res.status(409).json({ error: 'User already exists' });
    }

    await conn.query('BEGIN');

    const hash = await bcrypt.hash(data.password, 10);
    const userResult = await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.name, data.email, hash, 'owner']
    );
    const userId = userResult.rows[0].id;
    console.log('REGISTER created user id:', userId);

    const slugBase = data.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = `${slugBase}-${Date.now()}`;

    const restaurantResult = await conn.query(
      'INSERT INTO restaurants (owner_user_id, name, slug, phone, address) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, data.restaurantName, slug, data.phone, data.address]
    );
    const restaurantId = restaurantResult.rows[0].id;
    console.log('REGISTER created restaurant id:', restaurantId);

    for (let i = 1; i <= data.totalTables; i += 1) {
      const tableNumber = `Table ${i}`;
      const token = `${restaurantId}-${tableNumber.replace(/\s+/g, '-')}-${Date.now()}-${i}`;

      const tableResult = await conn.query(
        'INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token) VALUES ($1, $2, $3) RETURNING id',
        [restaurantId, tableNumber, token]
      );
      const tableId = tableResult.rows[0].id;

      const { qrUrl, qrDataUrl } = await buildQrPayload({
        restaurantId,
        tableId,
      });

      await conn.query(
        `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
         VALUES ($1, $2, $3, $4)`,
        [restaurantId, tableId, qrUrl, qrDataUrl]
      );
    }

    await conn.query('UPDATE users SET restaurant_id = $1 WHERE id = $2', [restaurantId, userId]);
    await conn.query('COMMIT');

    const token = signToken({ id: userId, email: data.email, role: 'owner' });

    return res.status(201).json({
      message: 'Owner registered successfully',
      token,
      user: { id: userId, name: data.name, email: data.email, role: 'owner' },
      restaurant: { id: restaurantId, name: data.restaurantName, slug, totalTables: data.totalTables },
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    try {
      await conn.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('REGISTER ROLLBACK ERROR:', rollbackError);
    }
    return res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, role, restaurant_id FROM users WHERE email = $1',
    [data.email]
  );

  if (!rows.length) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(data.password, user.password_hash);

  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken(user);

  let restaurant = null;
  if (user.role === 'owner') {
    const { rows: restaurantRows } = await pool.query(
      'SELECT id, name, slug FROM restaurants WHERE owner_user_id = $1 LIMIT 1',
      [user.id]
    );
    restaurant = restaurantRows[0] || null;
  } else if (user.restaurant_id) {
    const { rows: restaurantRows } = await pool.query('SELECT id, name, slug FROM restaurants WHERE id = $1 LIMIT 1', [user.restaurant_id]);
    restaurant = restaurantRows[0] || null;
  }

  return res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    restaurant,
  });
}));

router.post('/bootstrap-super-admin', asyncHandler(async (req, res) => {
  const { name, email, password, setupKey } = req.body;

  if (!setupKey || setupKey !== process.env.SUPER_ADMIN_SETUP_KEY) {
    return res.status(403).json({ message: 'Invalid setup key' });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  const { rows: existing } = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['super_admin']);
  if (existing.length) {
    return res.status(409).json({ message: 'Super admin already exists' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, hash, 'super_admin']
  );

  return res.status(201).json({
    message: 'Super admin created',
    userId: result.rows[0].id,
  });
}));

router.get('/me', requireAuth(), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role, restaurant_id FROM users WHERE id = $1', [req.user.userId]);

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({ user: rows[0] });
}));

module.exports = router;
