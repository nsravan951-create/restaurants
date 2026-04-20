import { useEffect, useState } from "react";

export default function StaffPage() {
  const [restaurantId, setRestaurantId] = useState("1");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOrders() {
    if (!restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders?restaurantId=${encodeURIComponent(restaurantId)}`);
      if (!res.ok) throw new Error(`Failed to fetch orders (${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data.orders) ? data.orders : [];
      setOrders(list.filter((o) => o.status === "ready"));
    } catch (err) {
      setError(err.message || "Unable to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 4000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  async function markDelivered(orderId) {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status: "completed" }),
    });
    await loadOrders();
  }

  return (
    <main className="app-shell">
      <section className="panel row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Staff</h1>
          <p className="muted">Serve ready orders and mark delivery complete.</p>
        </div>
        <div>
          <label htmlFor="staffRestaurantId">Restaurant ID</label>
          <input
            id="staffRestaurantId"
            className="input"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        {loading ? <p><span className="spinner" /> Loading...</p> : null}
        {error ? <p style={{ color: "#8b1e1e" }}>{error}</p> : null}
        {!loading && !orders.length ? <p>No ready orders.</p> : null}

        <div className="grid">
          {orders.map((order) => (
            <article key={order.id} className="panel">
              <strong>Order #{order.id}</strong>
              <p className="muted">Table: {order.tableId}</p>
              <button className="btn" onClick={() => markDelivered(order.id)}>Mark Delivered</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
