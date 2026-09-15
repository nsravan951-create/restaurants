require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { validateEnvironment, getJwtSecret } = require('./src/config/env');

let app;
let db;
let initSocket;
let expireInactiveSessions;

try {
  validateEnvironment();
  app = require('./app');
  db = require('./db');
  ({ initSocket } = require('./src/services/socket'));
  ({ expireInactiveSessions } = require('./src/utils/tableSession'));
} catch (error) {
  console.error('[startup] configuration error:', error.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === 'production';
const server = http.createServer(app);

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

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Socket CORS not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
});

initSocket(io);

io.use((socket, next) => {
  try {
    const header = socket.handshake.headers.authorization || '';
    const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) return next(new Error('Unauthorized socket connection'));
    socket.data.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch (error) {
    return next(new Error('Unauthorized socket connection'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;

  if (user?.role === 'super_admin') {
    socket.join('super_admin');
  }

  socket.on('restaurant:join', async (restaurantId) => {
    const requestedRestaurantId = Number(restaurantId);
    if (!user || !Number.isInteger(requestedRestaurantId) || requestedRestaurantId <= 0) return;

    if (user.role === 'super_admin') {
      socket.join(`restaurant_${requestedRestaurantId}`);
      return;
    }

    const { rows } = await db.query('SELECT restaurant_id FROM users WHERE id = $1 LIMIT 1', [user.userId]);
    if (rows[0] && Number(rows[0].restaurant_id) === requestedRestaurantId) {
      socket.join(`restaurant_${requestedRestaurantId}`);
    }
  });
});

let sessionExpiryTimer = null;

async function startServer() {
  try {
    await db.schemaReady;
    console.log('[db] connection ready');
  } catch (error) {
    console.error('[db] startup failed:', error.message);
    if (isProduction) {
      process.exit(1);
    }
    console.warn('[db] continuing without database in non-production mode');
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`[shutdown] received ${signal}`);
  if (sessionExpiryTimer) clearInterval(sessionExpiryTimer);

  server.close(async () => {
    try {
      await db.end();
    } catch (error) {
      console.error('[shutdown] database pool close failed:', error.message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[shutdown] forced exit after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch((error) => {
  console.error('[startup] fatal error:', error.message);
  process.exit(1);
});

sessionExpiryTimer = setInterval(async () => {
  try {
    const expiredCount = await expireInactiveSessions();
    if (expiredCount > 0) {
      console.log(`[table-session] auto-expired: ${expiredCount}`);
    }
  } catch (error) {
    console.error('[table-session] expiry tick failed', error.message);
  }
}, 60 * 1000);
