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
  // also emit a global order update for super-admin dashboard
  try { ioInstance.emit('order:update:global', { ...payload, restaurantId }); } catch (e) {}
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
  emitOrderUpdate,
  emitTableUpdate,
  emitInvoiceCreated,
};
