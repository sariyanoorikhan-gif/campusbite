# Prepaid checkout and buyer handover

## Current demo

The deployed storefront explicitly uses `PAYMENT_MODE=DEMO`. It does **not** collect money, open PhonePe/Google Pay, or request UPI PINs, bank details or card details. PhonePe/Google Pay/Other UPI on the cart are app previews. The CampusBite payment page offers clearly labelled simulated success/failure actions.

Only simulated success creates a labelled DEMO paid food order. Failed/abandoned sessions are not food orders. Reservations expire after up to eight minutes; expiry/failed payment releases stock and pickup capacity exactly once. The old unpaid-order endpoint and manual staff payment-marking endpoint are disabled. Demo totals are labelled as demo totals in reports.

## Buyer configuration

The buyer should create and verify **their own PhonePe Payment Gateway merchant account**. The demo seller does not collect or hold funds for the buyer. PhonePe activation and UAT sign-off must be completed before live use.

Privately add these server-only environment variables in the buyer's Vercel project:

| Variable | Required value |
| --- | --- |
| PAYMENT_MODE | DEMO for the current simulator; SANDBOX for PhonePe UAT; LIVE for actual payments |
| PHONEPE_CLIENT_ID | Merchant client ID from PhonePe |
| PHONEPE_CLIENT_SECRET | Merchant client secret from PhonePe |
| PHONEPE_CLIENT_VERSION | Numeric version issued by PhonePe |
| PHONEPE_WEBHOOK_USERNAME | Private callback username configured in PhonePe |
| PHONEPE_WEBHOOK_PASSWORD | Private callback password configured in PhonePe |
| APP_ORIGIN | Exact HTTPS production origin for the buyer's deployment |
| DATABASE_URL | Buyer's persistent PostgreSQL connection |
| SESSION_SECRET | A newly generated private session secret |

Secrets must never be pasted into frontend code, source control or chat. Sandbox and live credentials are distinct. Set the final merchant-owned origin before enabling payment. Update gateway webhook and redirect settings when changing domains. Redeploy after changing environment variables.

The PhonePe callback URL is `https://YOUR-DOMAIN/api/payments/phonepe/webhook`. Subscribe to order-completed and order-failed checkout events. The return URL is generated as `/payment/<merchant-order-id>`. Configure available UPI/payment methods in the merchant dashboard. Supported UPI apps and desktop QR are rendered by PhonePe's hosted checkout; exact options depend on merchant activation, browser and device. No direct UPI link or browser success flag is accepted as evidence of payment.

## Verified payment flow

1. Signed-in student selects items and a pickup slot.
2. Server validates prices and briefly reserves stock/capacity in Checkout. No Order exists yet.
3. Live/sandbox mode opens PhonePe Standard Checkout using the official Node SDK. Demo mode opens the CampusBite simulator instead.
4. On return, the server asks the gateway for the saved merchant order's status and checks its amount, gateway order ID, completed state and transaction ID. Authenticated gateway callbacks use the same reconciliation path.
5. A successful payment creates one paid Order and one payment event in a transaction, with immutable purchased item/price snapshots. Duplicate verification/callbacks cannot create a second order.
6. Staff see paid orders from the current payment environment. The kitchen cannot accept, prepare or hand over unpaid orders. In LIVE mode the server also rejects fulfillment of DEMO/SANDBOX/legacy orders.

The simulator is inaccessible through its API when the server is configured as LIVE or SANDBOX. Missing merchant configuration in LIVE/SANDBOX fails closed; there is no pay-at-pickup fallback.

## Refund handling and expiry

Paid order self-cancellation and automatic staff rejection remain blocked. The buyer must operate a refund process using their PhonePe merchant dashboard. An actual payment received after a stock reservation expires is recorded as REFUND_PENDING without creating an unreserved food order. Its gateway order/transaction references appear under **Management → Payments & setup** for refund review. Refund execution and automatic refund reconciliation are **not implemented**; the buyer must complete and verify this workflow before accepting real customer payments.

Expired holds are swept on checkout/menu/slot requests and when the payment page is checked. Before a larger rollout, schedule expiry reconciliation, add shared rate limiting, verify college email ownership, and add production monitoring. Current holds are capped at 10 units per checkout and two pending sessions per student.

## Validation and release limits

Automated tests exercise demo checkout success/failure, expiration, ownership, idempotency, stock/slot contention, paid-only kitchen handling, live-mode isolation, gateway amount/order matching, callback authentication, late payments, role/CSRF checks, and disk persistence. Live gateway behavior is tested through injected provider fixtures. No actual PhonePe merchant account, sandbox transaction, bank collection, settlement, or refund has been tested in this delivery.

Buyer go-live requires their PhonePe sandbox/UAT tests followed by an authorized real test collection and verification in the merchant dashboard. This code is an integration prepared for handover, not a claim of completed merchant activation or production payment certification.

Official references:

- https://developer.phonepe.com/phonepe-payment-gateway/pg-v2-standard-checkout-integration
- https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/order-status
- https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/webhook

## New APIs

- GET /api/payments/config — mode, enabled status and explicit demo disclosure.
- POST /api/payments/checkouts — authenticated student, CSRF, item/slot/price validation and idempotency key; returns payment session/redirect.
- GET /api/payments/checkouts/:id — own checkout summary; no payment confirmation from query parameters.
- POST /api/payments/checkouts/:id/verify — own checkout gateway reconciliation.
- POST /api/payments/checkouts/:id/demo — own success/failure simulation, DEMO mode only.
- POST /api/payments/phonepe/webhook — authenticated PhonePe callback; no browser session required.
- GET /api/admin/payments — admin-only setup state and late-payment refund review queue.
- POST /api/orders — rejected: prepayment is required.
- POST /api/orders/:id/payment — retired: manual paid marking is disabled.
