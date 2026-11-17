# CampusBite API

All endpoints are under `/api`. JSON errors use `{ "error": "message" }`. Cookie authentication is required where indicated. GET `/session` returns `{user, csrf}`. Send `x-csrf-token` on every mutation; login regenerates the session and returns a new CSRF token. Requests from a supplied Origin must match APP_ORIGIN. Password hashes are never returned.

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | /health | Database readiness |
| GET | /session | User and CSRF token |
| POST | /auth/register | Student only; name, email, rollNumber, password (10+ chars) |
| POST | /auth/login | Email and password |
| POST | /auth/logout | Authenticated session destruction |
| PATCH | /profile | Own name and rollNumber |
| GET | /menu | Demo food catalog, daily remaining stock, settings and effective opening state |
| GET | /slots | Same-day future slots; client disables full/too-soon slots; server revalidates |
| GET | /favorites | Own saved food IDs |
| POST | /favorites/:id | Toggle own favorite |
| GET | /orders?page=1 | Own orders for students; all orders for staff/admin. 30 per page |
| GET | /orders/:id | Owner or staff; staff responses omit pickupToken |
| POST | /orders | Students; transactional reservation and creation |
| PATCH | /orders/:id/status | Allowed status and optional reason; own eligible cancellation for students |
| POST | /orders/:id/payment | Staff; confirm money actually received; idempotent |
| POST | /orders/:id/collect | Staff; `{token}` required, paid/ready/unexpired order only |
| GET | /notifications | Own last 50 notifications |
| PATCH | /notifications/read | Mark own notifications read |
| POST | /admin/menu | Admin; create dish |
| PATCH | /admin/menu/:id | Admin menu edit/archive; staff limited to availability and remaining stock |
| GET | /admin/settings | Staff/admin |
| PATCH | /admin/settings | Admin; schedule changes blocked while active orders exist |
| GET | /admin/users | Admin; latest 100 public account details |
| POST | /admin/staff | Admin; name, email, initial password |
| GET | /admin/audit | Admin; latest 100 actions |
| GET | /admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD | Admin; max 366-day range, college-local business days |
| GET | /admin/analytics?format=csv | Admin; collected-sales daily CSV |

Checkout body:

```json
{
  "items": [{"id":"food-1","quantity":1,"unitPrice":6000}],
  "slotId":"2026-11-16-780",
  "note":"Less spicy, please.",
  "idempotencyKey":"a-client-generated-UUID"
}
```

`unitPrice` is the client’s last observed price, used only to detect a price change. The backend reads actual prices, checks all items and opening rules, conditionally reserves stock/capacity, and writes purchase snapshots in one transaction. Reusing the same key/body returns the saved order. Reusing it with a different body returns 409.

Status codes: 400 invalid input, 401 no session, 403 forbidden/CSRF/origin, 404 absent or inaccessible record, 409 business conflict, 429 rate limit. An order belonging to another student returns 404. Online payment callback endpoints do not exist.

Production rate limits currently use process memory. Back these with shared storage before multiple instances; configure trusted proxy and session-secret rotation deliberately.
