-- Add idempotency keys to Remittance and PhysicalCustodyMovement with safeguards

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Remittance'
          AND column_name = 'idempotencyKey'
    ) THEN
        ALTER TABLE "Remittance" ADD COLUMN "idempotencyKey" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Remittance_fromUserId_idempotencyKey_key'
    ) THEN
        ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_fromUserId_idempotencyKey_key" UNIQUE ("fromUserId", "idempotencyKey");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'PhysicalCustodyMovement'
          AND column_name = 'idempotencyKey'
    ) THEN
        ALTER TABLE "PhysicalCustodyMovement" ADD COLUMN "idempotencyKey" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'PhysicalCustodyMovement_userId_idempotencyKey_key'
    ) THEN
        ALTER TABLE "PhysicalCustodyMovement" ADD CONSTRAINT "PhysicalCustodyMovement_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey");
    END IF;
END $$;
