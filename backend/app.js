const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./src/routes/auth.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const menuRoutes = require('./src/routes/menu.routes');
const orderRoutes = require('./src/routes/order.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const adRoutes = require('./src/routes/ad.routes');
const adminRoutes = require('./src/routes/admin.routes');
const tableSessionRoutes = require('./src/routes/tableSession.routes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://restaurants-os3fs97xx-nsravan951-creates-projects.vercel.app',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));
app.use(express.json());
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[api] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'qr-restaurant-backend' });
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/menu', menuRoutes);
app.use('/order', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/table-sessions', tableSessionRoutes);


app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Invalid URL' });
});

module.exports = app;
