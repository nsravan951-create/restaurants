let memoryOrders = [];
let nextOrderId = 1001;

function normalizeOrder(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  return {
    id: nextOrderId++,
    restaurantId: Number(input.restaurantId),
    tableId: Number(input.tableId),
    items: items.map((item) => ({
      id: item.id ?? null,
      name: String(item.name || "Item"),
      price: Number(item.price || 0),
      qty: Number(item.qty || 1),
    })),
    total,
    status: "placed",
    paymentStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const restaurantId = Number(req.query.restaurantId || 0);
    const status = String(req.query.status || "").trim();

    let orders = [...memoryOrders];
    if (restaurantId > 0) {
      orders = orders.filter((order) => order.restaurantId === restaurantId);
    }
    if (status) {
      orders = orders.filter((order) => order.status === status);
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const body = req.body || {};

    if (!body.restaurantId || !body.tableId || !Array.isArray(body.items) || !body.items.length) {
      return res.status(400).json({ error: "restaurantId, tableId and items are required" });
    }

    const order = normalizeOrder(body);
    memoryOrders.unshift(order);
    return res.status(201).json({ message: "Order created", order });
  }

  if (req.method === "PATCH") {
    const body = req.body || {};
    const orderId = Number(body.orderId || 0);

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const orderIndex = memoryOrders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) {
      return res.status(404).json({ error: "Order not found" });
    }

    const existing = memoryOrders[orderIndex];
    const updated = {
      ...existing,
      status: body.status || existing.status,
      paymentStatus: body.paymentStatus || existing.paymentStatus,
      updatedAt: new Date().toISOString(),
    };

    memoryOrders[orderIndex] = updated;
    return res.status(200).json({ message: "Order updated", order: updated });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
