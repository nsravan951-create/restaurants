const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./src/routes/auth.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const menuRoutes = require('./src/routes/menu.routes');
const orderRoutes = require('./src/routes/order.routes');
const ownerRoutes = require('./src/routes/owner.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const adRoutes = require('./src/routes/ad.routes');
const adminRoutes = require('./src/routes/admin.routes');
const platformRoutes = require('./src/routes/platform.routes');
const messagingRoutes = require('./src/routes/messaging.routes');
const invoiceRoutes = require('./src/routes/invoice.routes');
const tableSessionRoutes = require('./src/routes/tableSession.routes');
const reviewsRoutes = require('./src/routes/reviews.routes');
const couponsRoutes = require('./src/routes/coupons.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const refundsRoutes = require('./src/routes/refunds.routes');
const subscriptionsRoutes = require('./src/routes/subscriptions.routes');
const teamRoutes = require('./src/routes/team.routes');
const reconciliationRoutes = require('./src/routes/reconciliation.routes');
const masterAdminRoutes = require('./src/routes/masterAdmin.routes');
const exportsRoutes = require('./src/routes/exports.routes');
const { teamRouter: supportTeamRouter, ownerRouter: supportOwnerRouter } = require('./src/routes/supportTickets.routes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

const allowedOrigins = new Set(
  String(process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

allowedOrigins.add('https://autoresto.in');
allowedOrigins.add('https://restaurants.netlify.app');
allowedOrigins.add('https://restaurantts.netlify.app');
allowedOrigins.add('https://restauranttts.netlify.app');

const corsOptions = {
  origin(origin, callback) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Request from:', origin);
    }
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS not allowed: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({
  verify(req, res, buffer) {
    if (req.originalUrl.split('?')[0].endsWith('/cashfree/webhook')) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[api] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});


app.get('/api/health', async (req, res) => {
  const payload = {
    status: 'ok',
    service: 'qr-restaurant-backend',
    database: 'unknown',
    timestamp: new Date().toISOString(),
  };

  try {
    await pool.ready();
    payload.database = 'connected';
    return res.json(payload);
  } catch (error) {
    payload.status = 'degraded';
    payload.database = 'disconnected';
    return res.status(503).json(payload);
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/test-db', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database connection failed' });
    }
  });
}

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/orders', orderRoutes);
app.use('/menu', menuRoutes);
app.use('/order', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/ads', adRoutes);
app.use('/ads', adRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/platform-orders', platformRoutes);
app.use('/platform-orders', platformRoutes);
app.use('/api/admin/messages', messagingRoutes);
app.use('/api/table-sessions', tableSessionRoutes);
app.use('/table-sessions', tableSessionRoutes);
app.use('/sessions', tableSessionRoutes);
app.use('/tables', restaurantRoutes);
app.use('/owner', ownerRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/refunds', refundsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/admin/reconciliation', reconciliationRoutes);
app.use('/api/master-admin', masterAdminRoutes);
app.use('/api/master-admin/exports', exportsRoutes);
app.use('/api/master-admin/support-tickets', supportTeamRouter);
app.use('/owner/support-tickets', supportOwnerRouter);


app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Invalid URL' });
});

module.exports = app;
