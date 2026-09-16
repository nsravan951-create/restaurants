let ioInstance = null;

function initSocket(io) {
  ioInstance = io;
}

function getSocket() {
  return ioInstance;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized');
  }
  return ioInstance;
}

function emitOrderUpdate(restaurantId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`restaurant_${restaurantId}`).emit('order:update', payload);
  ioInstance.to('super_admin').emit('order:update:global', { ...payload, restaurantId });
}

function emitTableUpdate(restaurantId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`restaurant_${restaurantId}`).emit('table:update', payload);
}

function emitInvoiceCreated(restaurantId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`restaurant_${restaurantId}`).emit('invoice:created', payload);
}

module.exports = {
  initSocket,
  getSocket,
  getIO,
  emitOrderUpdate,
  emitTableUpdate,
  emitInvoiceCreated,
};
