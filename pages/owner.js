import { useEffect, useMemo, useState } from "react";

export default function OwnerPage() {
  const [restaurantId, setRestaurantId] = useState("1");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  async function loadOrders() {
    if (!restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders?restaurantId=${encodeURIComponent(restaurantId)}`);
      if (!res.ok) throw new Error(`Failed to fetch orders (${res.status})`);
      const data = await res.json();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err.message || "Unable to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  const totals = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.count += 1;
        acc.revenue += Number(order.total || 0);
        if (order.status === "completed") acc.completed += 1;
        return acc;
      },
      { count: 0, revenue: 0, completed: 0 }
    );
  }, [orders]);

  async function updateOrder(orderId, patch) {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, ...patch }),
    });
    await loadOrders();
  }

  return (
    <main className="app-shell">
      <section className="panel row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Owner Dashboard</h1>
          <p className="muted">Track all table orders and payment completion.</p>
        </div>
        <div>
          <label htmlFor="ownerRestaurantId">Restaurant ID</label>
          <input
            id="ownerRestaurantId"
            className="input"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h3>Summary</h3>
        <p>Total Orders: {totals.count}</p>
        <p>Completed Orders: {totals.completed}</p>
        <p>Total Revenue: INR {totals.revenue.toFixed(2)}</p>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h3>Live Orders</h3>
        {loading ? <p><span className="spinner" /> Loading...</p> : null}
        {error ? <p style={{ color: "#8b1e1e" }}>{error}</p> : null}
        {!loading && !orders.length ? <p>No orders yet.</p> : null}

        <div className="grid">
          {orders.map((order) => (
            <article key={order.id} className="panel">
              <strong>Order #{order.id}</strong>
              <p className="muted">Table: {order.tableId}</p>
              <p>Status: {order.status}</p>
              <p>Payment: {order.paymentStatus}</p>
              <p>Total: INR {Number(order.total || 0).toFixed(2)}</p>
              <div className="row">
                <button className="btn secondary" onClick={() => updateOrder(order.id, { paymentStatus: "paid" })}>Mark Paid</button>
                <button className="btn" onClick={() => updateOrder(order.id, { status: "completed" })}>Complete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
