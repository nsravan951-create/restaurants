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
  const data = ownerRegisterSchema.parse({
    ...req.body,
    totalTables: Number(req.body.totalTables),
  });
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existing.length) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const hash = await bcrypt.hash(data.password, 10);
    const [userResult] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [data.name, data.email, hash, 'owner']
    );

    const slugBase = data.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = `${slugBase}-${Date.now()}`;

    const [restaurantResult] = await conn.query(
      'INSERT INTO restaurants (owner_user_id, name, slug, phone, address) VALUES (?, ?, ?, ?, ?)',
      [userResult.insertId, data.restaurantName, slug, data.phone, data.address]
    );

    for (let i = 1; i <= data.totalTables; i += 1) {
      const tableNumber = `Table ${i}`;
      const token = `${restaurantResult.insertId}-${tableNumber.replace(/\s+/g, '-')}-${Date.now()}-${i}`;

      const [tableResult] = await conn.query(
        'INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token) VALUES (?, ?, ?)',
        [restaurantResult.insertId, tableNumber, token]
      );

      const { qrUrl, qrDataUrl } = await buildQrPayload({
        restaurantId: restaurantResult.insertId,
        tableId: tableResult.insertId,
      });

      await conn.query(
        `INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
         VALUES (?, ?, ?, ?)`,
        [restaurantResult.insertId, tableResult.insertId, qrUrl, qrDataUrl]
      );
    }

    await conn.query('UPDATE users SET restaurant_id = ? WHERE id = ?', [restaurantResult.insertId, userResult.insertId]);
    await conn.commit();

    const token = signToken({ id: userResult.insertId, email: data.email, role: 'owner' });

    return res.status(201).json({
      message: 'Owner registered successfully',
      token,
      user: { id: userResult.insertId, name: data.name, email: data.email, role: 'owner' },
      restaurant: { id: restaurantResult.insertId, name: data.restaurantName, slug, totalTables: data.totalTables },
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, role, restaurant_id FROM users WHERE email = ?',
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
    const [restaurantRows] = await pool.query(
      'SELECT id, name, slug FROM restaurants WHERE owner_user_id = ? LIMIT 1',
      [user.id]
    );
    restaurant = restaurantRows[0] || null;
  } else if (user.restaurant_id) {
    const [restaurantRows] = await pool.query('SELECT id, name, slug FROM restaurants WHERE id = ? LIMIT 1', [user.restaurant_id]);
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

  const [existing] = await pool.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['super_admin']);
  if (existing.length) {
    return res.status(409).json({ message: 'Super admin already exists' });
  }

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, 'super_admin']
  );

  return res.status(201).json({
    message: 'Super admin created',
    userId: result.insertId,
  });
}));

router.get('/me', requireAuth(), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role, restaurant_id FROM users WHERE id = ?', [req.user.userId]);

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({ user: rows[0] });
}));

module.exports = router;
