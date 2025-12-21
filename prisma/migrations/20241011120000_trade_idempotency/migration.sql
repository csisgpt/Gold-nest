-- Trade idempotency and cancellation timestamps
ALTER TABLE "Trade"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Trade_clientId_idempotencyKey_key" ON "Trade"("clientId", "idempotencyKey");
