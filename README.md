# CampusBite

**Current payment flow:** prepaid checkout with an explicitly labelled DEMO simulator. No real money is charged. A successful test payment creates the food order; unpaid checkout sessions do not reach the kitchen. Buyer activation guide: docs/PAYMENTS-BUYER-SETUP.md.

A college canteen pre-order system with a food-first responsive interface, persistent PostgreSQL data, student accounts, kitchen workflows, and an admin workspace.

## Start on Windows

Double-click **START-CAMPUSBITE.cmd** in this folder. Keep the terminal open, then visit **http://localhost:5173** once it prints “CampusBite ready”. The launcher installs missing dependencies, generates Prisma Client, creates a random local session secret, and seeds a new embedded database. Node.js 22.12+ and internet access for the first installation are required.

If port 5173 is already in use by CampusBite, open the existing address. Do not launch two servers on the same embedded database directory.

## Standard setup

```powershell
npm ci
Copy-Item .env.example .env
# Replace SESSION_SECRET with a random value of at least 32 characters.
npm run db:generate
npm run seed
npm run dev
```

Open http://localhost:5173. Frontend and API use the same origin and port. There is no second frontend process to start.

### Local demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | student@campusbite.edu | CampusBite123! |
| Second student | riya@campusbite.edu | CampusBite123! |
| Kitchen staff | staff@campusbite.edu | CampusBite123! |
| Admin | admin@campusbite.edu | CampusBite123! |

Menu and prices are demo data. Orders, sales, and status history are real persisted actions; the seed script does not invent orders or reviews. Seed is repeatable and preserves existing menu changes and accounts. To use a different initial demo password, set DEMO_PASSWORD before the first seed.

The default schedule for a new database is **08:00–22:00 Asia/Kolkata**, in 15-minute slots, with 15 orders per slot and a five-minute cutoff. Food preparation time may require a later slot. No future-day booking is allowed. Staff set daily stock; new daily food entries start with 40 portions. No-show marking is a staff action available after the configured grace period; cooked food is not returned to stock.

## What works

- Student registration/login/logout and editable profile.
- Food search, categories, price/vegetarian filters, dish details and favorites.
- Persistent local cart, same-day pickup selection, checkout review and order creation.
- Server-calculated integer-paise totals and immutable purchase snapshots.
- Transactional stock/slot reservations, row locking and idempotent checkout.
- Student order tracking with five-second polling, reconnect behavior and in-app notifications.
- QR pickup passes, manual code verification, expiry, and single-use collection.
- Staff acceptance, preparation, ready, rejection and no-show workflows.
- Prepaid checkout, demo success/failure simulation, paid-only kitchen orders, expiry cleanup, and a prepared PhonePe Standard Checkout adapter.
- Admin menu creation/editing/archiving, daily stock, staff accounts, settings, activity log, actual-sales reports, date filters and CSV export.
- Responsive mobile navigation and printable receipts.

## Database options

**Local default:** without DATABASE_URL, Prisma uses PGlite, an embedded PostgreSQL engine, persisted in `.data/campusbite`. Migrations run automatically. It requires one Node process and a local filesystem; do not run the active database on multiple devices through OneDrive or use this mode for multiple server replicas.

**Separate PostgreSQL:** install Docker, then:

```powershell
docker compose up -d
# In .env set:
# DATABASE_URL=postgresql://campusbite:campusbite@localhost:5432/campusbite
npm run db:migrate
npm run seed
npm run dev
```

The same Prisma models and business logic serve both modes. Changing DATABASE_URL changes the database; existing PGlite records are not automatically transferred. Migration SQL and integrity constraints are committed under `prisma/migrations`.

## Build and test

```powershell
npm test
npm run build
```

The build generates Prisma Client, checks TypeScript, and creates the frontend bundle. Tests use an isolated temporary embedded PostgreSQL database and remove it afterward; they do not change application data. See `docs/VERIFICATION.md` for tested cases and browser evidence.

## Production deployment

Live production demo: https://campusbite-eta-lilac.vercel.app . Frontend and Express API are deployed on Vercel, with persistent PostgreSQL and sessions on Neon. See docs/HOSTED-DEPLOYMENT.md. A frontend-only static upload cannot run the API.

For production:

1. Provision PostgreSQL and set DATABASE_URL.
2. Set NODE_ENV=production, HOST=0.0.0.0, PORT, APP_ORIGIN to the exact HTTPS origin, and a unique SESSION_SECRET of at least 32 characters.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, then `npm run build`.
4. Provision administrator credentials through a controlled seed/setup process; never deploy the documented demo password. The built-in seed requires an explicit DEMO_PASSWORD in production.
5. Run `npm start` behind one trusted HTTPS reverse proxy. Secure cookies require HTTPS. Adjust the `trust proxy` setting if the network topology differs.
6. Back up PostgreSQL, configure a persistent session cleanup job, and use shared rate-limit storage before scaling to multiple processes.

Authentication uses bcrypt, express-session with a database store, HTTP-only SameSite cookies, CSRF tokens, origin checks, role checks, and rate limiting. Sessions expire after 24 hours. No secrets or pickup tokens are logged.

## Scope and remaining integrations

- Current hosted payments are **DEMO ONLY**. PhonePe live/sandbox mode requires the buyer merchant account and private credentials. Callback authentication and server-side status verification are implemented; actual gateway transactions and automatic refunds have not been tested or enabled.
- QR passes are displayed; staff paste/type the secure code. A camera scanner is not included.
- Food images use approved HTTPS URLs, not file uploads. Demo photographs are illustrative; replace them with the canteen’s actual dish photos before launch. See `docs/IMAGES.md`.
- College email ownership is not verified and registration accepts valid email addresses. Add college-domain enforcement plus email verification before real campus rollout.
- Email/SMS/push, password recovery, automatic no-show processing, and external monitoring are future extensions.
- Rejection/cancellation of already-paid orders is blocked until refund handling is implemented.
- Menu/daily stock updates are observed within 30 seconds; order updates within five seconds. The UI does not promise an exact preparation countdown.
- The launcher supports the local embedded mode. Use the documented migration/seed commands when configuring a separate PostgreSQL server.

## Project structure

```text
src/                React pages, UI, styles and API client
server/app.ts       Express API, session store, authorization and validation
server/domain.ts    Reservations, timezone rules and order lifecycle
server/db.ts        PostgreSQL/PGlite Prisma adapters and local migrations
server/seed.ts      Explicit demo account/menu seeding
prisma/             Schema and SQL migrations
tests/              Isolated API/integration tests
docs/               API reference, diagrams, abstract and verification
```

This implementation was written for this project. The GitHub repositories supplied in the request served as feature references; no repository code was copied.


## Current canteen menu

The hosted menu now has 30 canteen dishes. See docs/CANTEEN-MENU.md for the revised menu, sample-price policy and explicit menu update command. Existing OneDrive embedded data has a restart/permissions issue; it is preserved. The hosted database is working; for local use, prefer the separate PostgreSQL setup above.
