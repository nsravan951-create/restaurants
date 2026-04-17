# QR Code Based Restaurant Ordering System

A production-ready, modular full-stack app for contactless restaurant/theater ordering via table QR codes.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express.js + Socket.IO
- Database: MySQL
- Payments: Razorpay (test mode)
- Deployment:
  - Frontend on Vercel
  - Backend + MySQL on Railway

## Project Structure

- `frontend/` static client app and dashboards
- `backend/` Express APIs, auth, business logic
- `database/` SQL schema and sample data

## Features Implemented

- Multi-restaurant owner registration/login
- Owner onboarding includes total table count and automatic `Table 1..N` creation
- Restaurant owner dashboard:
  - Menu CRUD
  - Table CRUD + dynamic QR generation + QR download/print
  - Auto-generate tables by total count
  - Kitchen and ready-order views
- Customer QR ordering flow:
  - URL format supported: `/restaurant/:id/table/:tableId`
  - View menu, cart, place order
  - Table lock/session acquisition on QR scan
  - Join existing session flow for locked tables
  - Session countdown timer + inactivity auto refresh
  - Optional customer name and notes
  - COD or Razorpay online payment flow
- Kitchen dashboard:
  - Real-time pending orders
  - Mark Preparing / Ready
- Staff dashboard:
  - Ready orders list
  - Mark Delivered
- Promotion system:
  - Popup ad after 1-2 minutes on customer page
  - Ad click tracking API
  - Admin ad management
- Super admin panel:
  - View total order summary
- Branding footer in all main pages:
  - Powered by Online Solutionzzz

## API Modules

- `POST /api/auth/register-owner`
- `POST /api/auth/login`
- `POST /api/auth/bootstrap-super-admin`
- `GET /api/menu/:restaurantId`
- `POST /api/menu`
- `PUT /api/menu/:itemId`
- `DELETE /api/menu/:itemId`
- `POST /api/orders`
- `GET /api/orders/restaurant/:restaurantId`
- `PATCH /api/orders/:orderId/status`
- `GET /api/orders/:orderId/invoice`
- `GET /api/orders/:orderId/invoice-data`
- `POST /api/payments/create-order`
- `POST /api/payments/verify`
- `POST /api/ads/click/:adId`
- `POST /api/ads` (super admin)
- `GET /api/admin/summary` (super admin)

## Local Setup

### 1. Database

1. Create a MySQL database and run:
   - `database/schema.sql`
2. Optional: load sample data:
   - `database/sample_data.sql`

### 2. Backend Setup

1. Go to backend:
  - `cd backend`
2. Install dependencies:
  - `npm install`
3. Create `.env` from `.env.example` and fill all values.
4. Start server:
  - `npm run dev`

Backend default URL: `http://localhost:5000`

### 3. Frontend Setup

Use any static server from `frontend/` folder (for local development):

- VS Code Live Server, or
- `npx serve frontend`

Frontend default URL: `http://localhost:3000` (or static server URL)

Use any static server from `frontend/` folder (for local development):

- VS Code Live Server, or
- `npx serve frontend`

Frontend default URL: `http://localhost:3000` (or static server URL)

## Environment Variables (Backend)

Required values in `backend/.env`:

- `PORT`
- `CORS_ORIGIN`
- `FRONTEND_PUBLIC_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `SUPER_ADMIN_SETUP_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

## Creating First Super Admin

Call endpoint once after backend startup:

- `POST /api/auth/bootstrap-super-admin`
- Body:

```json
{
  "name": "Platform Admin",
  "email": "admin@example.com",
  "password": "StrongPassword123",
  "setupKey": "your_SUPER_ADMIN_SETUP_KEY"
}
```

## Deployment

### Vercel (Frontend)

1. Import `frontend/` folder as Vercel project.
2. `frontend/vercel.json` rewrite already maps:
   - `/restaurant/:id/table/:tableId` -> `/pages/customer.html`
3. Set production backend URL in `frontend/assets/js/config.js` (replace placeholder Railway URL).

### Railway (Backend + MySQL)

1. Create Railway project for backend.
2. Add MySQL service.
3. Set all environment variables from `.env.example`.
4. Deploy backend folder (`backend/`).
5. Run SQL schema/sample in Railway MySQL.

## Notes

- Socket.IO is used for real-time dashboard order updates.
- Table session lock system ensures one active order session per table.
- Session ends on payment completion, delivered status, or timeout.
- Customer flow does not require login.
- Input validation is implemented via Zod and error middleware.

## New Session/Lock APIs

- `POST /api/table-sessions/start`
- `POST /api/table-sessions/:sessionId/ping`
- `POST /api/table-sessions/:sessionId/end`
