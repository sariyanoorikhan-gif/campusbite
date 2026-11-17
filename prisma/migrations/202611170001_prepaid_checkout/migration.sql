ALTER TABLE "Payment" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'LEGACY', ADD COLUMN "reference" TEXT;
CREATE TABLE "Checkout" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "slotId" TEXT NOT NULL REFERENCES "PickupSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "stockDay" TEXT NOT NULL,
 "items" JSONB NOT NULL,
 "total" INTEGER NOT NULL CHECK (total>0),
 "note" TEXT NOT NULL DEFAULT '',
 "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','COMPLETED','FAILED','EXPIRED','REFUND_PENDING')),
 "mode" TEXT NOT NULL CHECK (mode IN ('DEMO','SANDBOX','LIVE')),
 "method" TEXT NOT NULL DEFAULT 'UPI',
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "gatewayOrderId" TEXT,
 "gatewayTransactionId" TEXT,
 "gatewayUrl" TEXT,
 "orderId" TEXT REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Checkout_userId_idempotencyKey_key" ON "Checkout"("userId","idempotencyKey");
CREATE UNIQUE INDEX "Checkout_gatewayOrderId_key" ON "Checkout"("gatewayOrderId");
CREATE UNIQUE INDEX "Checkout_gatewayTransactionId_key" ON "Checkout"("gatewayTransactionId");
CREATE UNIQUE INDEX "Checkout_orderId_key" ON "Checkout"("orderId");
CREATE INDEX "Checkout_state_expiresAt_idx" ON "Checkout"("state","expiresAt");
