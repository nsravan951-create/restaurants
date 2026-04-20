import { useEffect, useState } from "react";

export default function KitchenPage() {
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
      setOrders(list.filter((o) => ["placed", "preparing", "ready"].includes(o.status)));
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

  async function updateStatus(orderId, status) {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    await loadOrders();
  }

  return (
    <main className="app-shell">
      <section className="panel row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Kitchen</h1>
          <p className="muted">Live preparation queue from table orders.</p>
        </div>
        <div>
          <label htmlFor="kitchenRestaurantId">Restaurant ID</label>
          <input
            id="kitchenRestaurantId"
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

        <div className="grid">
          {orders.map((order) => (
            <article key={order.id} className="panel">
              <strong>Order #{order.id}</strong>
              <p className="muted">Table: {order.tableId}</p>
              <p>Status: {order.status}</p>
              <ul>
                {order.items.map((item, idx) => (
                  <li key={`${order.id}-${idx}`}>{item.name} x {item.qty}</li>
                ))}
              </ul>
              <div className="row">
                <button className="btn secondary" onClick={() => updateStatus(order.id, "preparing")}>Preparing</button>
                <button className="btn" onClick={() => updateStatus(order.id, "ready")}>Ready</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
