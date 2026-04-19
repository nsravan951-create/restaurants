require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initSocket } = require('./src/services/socket');
const { expireInactiveSessions } = require('./src/utils/tableSession');

const PORT = Number(process.env.PORT || 5000);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});

initSocket(io);

io.on('connection', (socket) => {
  socket.on('restaurant:join', (restaurantId) => {
    socket.join(`restaurant_${restaurantId}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(async () => {
  try {
    const expiredCount = await expireInactiveSessions();
    if (expiredCount > 0) {
      console.log(`[table-session] auto-expired: ${expiredCount}`);
    }
  } catch (error) {
    console.error('[table-session] expiry tick failed', error.message);
  }
}, 60 * 1000);
