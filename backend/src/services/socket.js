let ioInstance = null;

function initSocket(io) {
  ioInstance = io;
}

function getSocket() {
  return ioInstance;
}

function emitOrderUpdate(restaurantId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`restaurant_${restaurantId}`).emit('order:update', payload);
}

module.exports = {
  initSocket,
  getSocket,
  emitOrderUpdate,
};
