# Backend Notes

## Start

- `npm install`
- copy `.env.example` to `.env`
- `npm run dev`

## Session Lock Config

- `TABLE_SESSION_TIMEOUT_MINUTES=20`
- Only one active table session is allowed per table.
- Session ends on payment verification, delivered status, or inactivity timeout.

## Base URL

- `http://localhost:5000/api`

## Roles

- `super_admin`
- `owner`
- `kitchen`
- `staff`

## Important Endpoints

- Auth: `/auth/*`
- Restaurants/Tables/QR: `/restaurants/*`
- Menu: `/menu/*`
- Orders: `/orders/*`
- Payments: `/payments/*`
- Table Sessions: `/table-sessions/*`
- Invoice: `/orders/:orderId/invoice`
- Ads: `/ads/*`
- Admin: `/admin/*`

Order items persist `item_price` so invoices and bill totals remain stable even if the menu changes later.

Customer checkout supports exactly two choices: Cash and Cashfree. Cashfree routes are prepared but intentionally do not create or confirm provider payments until the official Cashfree SDK/API contract and credentials are configured. Historical provider fields remain readable.
