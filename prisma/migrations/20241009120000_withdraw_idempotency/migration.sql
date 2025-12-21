-- Add optional idempotency key for withdrawal requests to support safe retries
ALTER TABLE "WithdrawRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WithdrawRequest_userId_idempotencyKey_key'
  ) THEN
    ALTER TABLE "WithdrawRequest"
      ADD CONSTRAINT "WithdrawRequest_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey");
  END IF;
END
$$;
