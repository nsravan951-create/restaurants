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

For online payments: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENVIRONMENT`, `CASHFREE_API_VERSION`, `CASHFREE_RETURN_URL`, and `CASHFREE_WEBHOOK_URL`

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
