import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="panel">
        <h1>Restaurant Unified Portal</h1>
        <p className="muted">Single Next.js deployment for table ordering and operations.</p>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Quick Links</h2>
        <ul>
          <li><Link href="/owner">Owner Dashboard</Link></li>
          <li><Link href="/kitchen">Kitchen Queue</Link></li>
          <li><Link href="/staff">Staff Console</Link></li>
          <li><Link href="/table/1?restaurantId=1">Sample Table QR Route</Link></li>
        </ul>
      </section>
    </main>
  );
}
