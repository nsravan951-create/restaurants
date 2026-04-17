const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const restaurantRoutes = require('./routes/restaurant.routes');
const menuRoutes = require('./routes/menu.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const adRoutes = require('./routes/ad.routes');
const adminRoutes = require('./routes/admin.routes');
const tableSessionRoutes = require('./routes/tableSession.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*' }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[api] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'qr-restaurant-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/table-sessions', tableSessionRoutes);

app.use(errorHandler);

module.exports = app;
