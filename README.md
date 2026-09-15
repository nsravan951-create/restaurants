# QR Restaurant Ordering (PostgreSQL + Realtime SaaS)

Contactless table ordering with QR codes, owner dashboard, kitchen/staff flows, Cash/Cashfree payments, and Socket.IO realtime updates.

## Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express, Socket.IO
- **Database:** PostgreSQL
- **Payments:** Cash and Cashfree Checkout

## Table color states (Owner dashboard)

| Status | Color | When |
|--------|-------|------|
| `available` | White | Table idle, ready for next guest |
| `active` | Orange | Customer scanned QR and started ordering |
| `paid` | Green | Payment completed; use **Terminal Reset** to clear |

## Quick start (local)

### 1. PostgreSQL

```bash
createdb qr_restaurant
psql -d qr_restaurant -f database/schema.sql
psql -d qr_restaurant -f database/sample_data.sql
```

Or run both via `database/setup_postgresql.sql` from inside `psql`.

After the base schema, apply versioned SQL migrations from `database/sql/` (in order — see `database/sql/APPLY_ORDER.txt`):

```bash
cd backend
npm run db:migrate
```

Or manually:

```bash
psql "$DATABASE_URL" -f database/sql/000_schema_migrations.sql
psql "$DATABASE_URL" -f database/sql/001_saas_billing_entitlements.sql
# ... continue through 006_performance_indexes.sql
```

Demo owner: `owner@demo.com` / `password123`

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, and Cashfree settings when the official integration is supplied
npm install
npm run dev
```

API: `http://localhost:5000`

### 3. Frontend

Serve the `frontend/` folder (Live Server, or `npx serve frontend` on port 3000).

`frontend/assets/js/config.js` auto-uses `http://localhost:5000` on localhost.

### 4. Super admin (once)

```http
POST http://localhost:5000/api/auth/bootstrap-super-admin
Content-Type: application/json

{
  "name": "Platform Admin",
  "email": "admin@example.com",
  "password": "StrongPassword123",
  "setupKey": "your_SUPER_ADMIN_SETUP_KEY"
}
```

## Main flows

1. Owner registers → tables + QR codes generated
2. Customer scans QR → `table.html?id={tableId}` → session starts → table turns **orange** on owner dashboard
3. Customer pays with Cashfree or staff confirms cash → invoice is synced
4. Owner clicks **Terminal Reset** → table returns **white**

## Environment variables

See `backend/.env.example`.

Required: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_PUBLIC_URL`

For online payments (Cashfree):

```env
CASHFREE_CLIENT_ID=your_sandbox_app_id
CASHFREE_CLIENT_SECRET=your_sandbox_secret
CASHFREE_ENVIRONMENT=sandbox
CASHFREE_API_VERSION=2026-01-01
CASHFREE_RETURN_URL=http://localhost:5500/table.html
CASHFREE_WEBHOOK_URL=https://your-ngrok-url/api/payments/cashfree/webhook
CASHFREE_WEBHOOK_OPTIONAL=true
```

Verify credentials: `cd backend && npm run cashfree:verify`

- Sandbox keys: [Cashfree Merchant Dashboard](https://merchant.cashfree.com) → Developers → API Keys (Sandbox)
- Local webhook: use [ngrok](https://ngrok.com) or set `CASHFREE_WEBHOOK_OPTIONAL=true` (return-page status polling handles payment)
- Webhook endpoint: `POST /api/payments/cashfree/webhook`

## API highlights

- `POST /api/auth/register-owner`
- `POST /api/auth/login`
- `POST /api/table-sessions/start`
- `POST /api/orders`
- `POST /api/payments/cashfree/create-order`
- `POST /api/payments/cashfree/webhook`
- `GET /api/payments/cashfree/return`
- `GET /api/restaurants/:id/tables`
- `POST /api/restaurants/:id/tables/:tableId/terminal-reset`

## Realtime (Socket.IO)

Owner dashboard joins room: `restaurant:join` with `restaurantId`.

Events: `table:update`, `order:update`, `invoice:created`
