# Verification record

Verified locally on Windows with Node.js 24, Prisma 7.10.1, and persisted embedded PostgreSQL. A separate Docker server was not available locally. Hosted Neon PostgreSQL was subsequently verified through the deployed Vercel API (see the hosted verification below).

## Automated checks

- TypeScript type check and Vite production build.
- API integration tests using actual sessions, CSRF protection, Prisma queries and an isolated PostgreSQL database.
- User login, registration with forced student role, role restrictions and origin rejection.
- Seeded menu and persisted favorites.
- Checkout, server pricing, stored order snapshots and idempotent replay.
- Reused checkout key with changed payload rejected.
- Another student cannot read/cancel an order; staff responses omit pickup secrets.
- Invalid status jumps, unpaid collection, wrong pickup code and repeat collection rejected.
- Payment recording is idempotent and preserves one payment event.
- Concurrent requests for the last portion produce exactly one successful order.
- Concurrent requests for the last pickup slot produce exactly one successful order.
- Cancellation restores stock and capacity once; repeat cancellation is rejected.
- Closed canteen, nonexistent slot, price changes and duplicate item IDs rejected.
- Collected-sales analytics and CSV export use stored orders.
- Unsupported online payment callback cannot update payment state.
- Expired pickup codes and premature no-show transitions rejected.
- A database is closed and reopened by a fresh Node process; orders and sessions remain present.

## Browser journey

Used the local application through its actual interface:

1. Signed in as admin, visited the kitchen board, and changed closing time to allow an evening test.
2. Signed out and signed in as the demo student.
3. Opened a dish, added it to the cart, selected a 21:00–21:15 pickup slot, entered a kitchen note, reviewed and placed the order.
4. Opened the persisted order and viewed its timeline, QR pass and pickup code.
5. Signed out and signed in as staff.
6. Accepted the order, started preparation, and marked it ready.
7. Confirmed the local test payment record, entered the student's code, and completed collection.
8. Filtered the staff board to COLLECTED and observed the order as COLLECTED and Paid.

This test recorded a local demo payment; no real payment service or money movement was involved.

Inspected desktop and 390×844 mobile views. At the mobile menu, document scroll width equaled client width (375 CSS pixels after the scrollbar), and no completed image had zero natural width. The mobile view showed horizontal category scrolling, two-column cards and fixed bottom navigation.

## Limits

Browser checks were interactive rather than a committed Playwright runner. They verify the principal journey and responsive layout, not every browser/device. Camera scanning, online payments and email verification are not implemented. Integration tests exercise the PostgreSQL engine through PGlite; hosted PostgreSQL, HTTPS sessions and API workflows were subsequently verified as recorded below.


## Hosted verification — 17 November 2026

Production URL: https://campusbite-eta-lilac.vercel.app

Vercel deployment dpl_C6LnzR47f4eWJ2TPivDAtm8gUq56 reached READY. The production HTTPS smoke test passed database health, 22 menu items, student/staff/admin login, CSRF/origin handling, checkout, idempotent replay, role and order ownership isolation, kitchen transitions, payment recording, incorrect/reused pickup rejection, successful collection, sales analytics and logout. Deployment test order CB-20261117-55AE0927 is marked as a verification test with no real payment in its kitchen note. The hosted demo is configured with 24-hour opening for testing. Hosted UI browser automation was unavailable; desktop/mobile browser inspection was completed against the local interface earlier.

## Prepaid demo release — 17 November 2026

Production deployment dpl_B3oqBATZ7cmaMCpDoC8CZnDBajdM reached READY. All 18 current integration tests and the production build passed. The public HTTPS test confirmed DEMO disclosure, no-order-before-payment, old unpaid-route rejection, manual-paid marking rejection, payment-session ownership, failure cleanup, successful demo payment, idempotent confirmation, paid-only kitchen progression, pickup verification, single-use token rejection, and clearly labelled demo reports. Test order CB-20261117-1B8DCA8E involved no money collection. Live gateway verification/callback behavior is covered with injected provider fixtures; no actual merchant payment, settlement or refund was performed. Hosted browser visual automation was unavailable in this turn. Runtime log review showed existing pg dependency deprecation/TLS-mode warnings; the hosted functional checks passed.
