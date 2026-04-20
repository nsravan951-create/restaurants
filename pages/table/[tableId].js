import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "https://your-render-backend.onrender.com";

function buildCategories(items) {
  const grouped = new Map();
  for (const item of items) {
    const category = item.category || "Other";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }
  return [...grouped.entries()];
}

export default function TableOrderPage() {
  const router = useRouter();
  const { tableId, restaurantId: restaurantIdQuery } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const restaurantId = String(restaurantIdQuery || "").trim() || "1";

  const categories = useMemo(() => buildCategories(menu), [menu]);

  async function loadRestaurant() {
    if (!tableId) return;
    setLoading(true);
    setError("");

    try {
      // Update this endpoint if your backend route differs.
      const endpoint = `${BACKEND_BASE_URL}/api/restaurant/${encodeURIComponent(restaurantId)}`;
      const res = await fetch(endpoint);

      if (!res.ok) throw new Error(`Restaurant API failed (${res.status})`);

      const data = await res.json();
      // Update these mappings if your response shape differs.
      const restaurantData = data.restaurant || data;
      const menuData = data.menu || data.menuItems || restaurantData.menu || [];

      setRestaurant(restaurantData);
      setMenu(Array.isArray(menuData) ? menuData : []);
    } catch (err) {
      setError(err.message || "Failed to load restaurant data.");
    } finally {
      setLoading(false);
    }
  }

  async function placeOrder() {
    if (!cart.length) {
      setMessage("Add at least one menu item.");
      return;
    }

    setPlacing(true);
    setMessage("");
    setError("");

    try {
      const payload = {
        restaurantId: Number(restaurantId),
        tableId: Number(tableId),
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price || 0),
          qty: item.qty,
        })),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Order failed (${res.status})`);
      }

      const data = await res.json();
      setCart([]);
      setMessage(`Order placed successfully. Order #${data.order.id}`);
    } catch (err) {
      setError(err.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  function addToCart(item) {
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx === -1) return [...prev, { ...item, qty: 1 }];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
      return copy;
    });
  }

  function adjustQty(itemId, delta) {
    setCart((prev) => {
      const next = prev
        .map((it) => (it.id === itemId ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0);
      return next;
    });
  }

  const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);

  useEffect(() => {
    if (router.isReady && tableId) {
      loadRestaurant();
    }
  }, [router.isReady, tableId, restaurantId]);

  return (
    <main className="app-shell">
      <section className="panel row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{restaurant ? restaurant.name : "Table Ordering"}</h1>
          <p className="muted">Restaurant #{restaurantId} | Table #{tableId || "..."}</p>
        </div>
        <button className="btn" onClick={loadRestaurant}>Reload Menu</button>
      </section>

      {!restaurant && !loading ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <p>Open this page as /table/[tableId]?restaurantId=[restaurantId]</p>
          <p className="muted">Example: /table/12?restaurantId=1</p>
        </section>
      ) : null}

      {loading ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <p><span className="spinner" /> Loading menu...</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel" style={{ marginTop: 12, color: "#8b1e1e" }}>
          {error}
        </section>
      ) : null}

      {categories.length ? (
        <section className="panel" style={{ marginTop: 12 }}>
          {categories.map(([category, items]) => (
            <div key={category} style={{ marginBottom: 18 }}>
              <h3>{category}</h3>
              <div className="grid">
                {items.map((item) => (
                  <article className="panel" key={item.id}>
                    <strong>{item.name}</strong>
                    <p className="muted">{item.description || ""}</p>
                    <p>INR {Number(item.price || 0).toFixed(2)}</p>
                    <button className="btn" onClick={() => addToCart(item)}>Add</button>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 12 }}>
        <h3>Cart</h3>
        {!cart.length ? <p className="muted">No items selected.</p> : null}
        {cart.map((item) => (
          <div className="row" key={item.id} style={{ justifyContent: "space-between" }}>
            <span>{item.name} x {item.qty}</span>
            <div className="row">
              <button className="btn secondary" onClick={() => adjustQty(item.id, -1)}>-</button>
              <button className="btn" onClick={() => adjustQty(item.id, 1)}>+</button>
            </div>
          </div>
        ))}
        <p><strong>Total: INR {total.toFixed(2)}</strong></p>
        <div className="row">
          <button className="btn" disabled={placing} onClick={placeOrder}>
            {placing ? "Placing..." : "Place Order"}
          </button>
        </div>
        {message ? <p style={{ color: "#18621a" }}>{message}</p> : null}
      </section>
    </main>
  );
}
