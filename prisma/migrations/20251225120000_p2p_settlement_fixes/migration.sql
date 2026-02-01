-- ============================================================================
-- AccountTx entry side for idempotent ledger entries
-- Fix: enum assignments must be explicitly cast to the enum type in Postgres.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE "AccountTxEntrySide" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Add column only if it doesn't exist (extra safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AccountTx'
      AND column_name = 'entrySide'
  ) THEN
    ALTER TABLE "AccountTx"
      ADD COLUMN "entrySide" "AccountTxEntrySide"
      NOT NULL
      DEFAULT 'CREDIT'::"AccountTxEntrySide";
  END IF;
END
$$;

-- Backfill existing rows (safe cast to enum)
UPDATE "AccountTx"
SET "entrySide" = CASE
  WHEN "delta" < 0 THEN 'DEBIT'::"AccountTxEntrySide"
  ELSE 'CREDIT'::"AccountTxEntrySide"
END
WHERE "entrySide" IS NULL;

-- Drop default after backfill
ALTER TABLE "AccountTx"
  ALTER COLUMN "entrySide" DROP DEFAULT;

-- Ensure old unique index (if any) is removed
DROP INDEX IF EXISTS "AccountTx_refType_refId_accountId_key";

-- Create new unique index including entrySide
-- (If it already exists, IF NOT EXISTS avoids error)
CREATE UNIQUE INDEX IF NOT EXISTS "AccountTx_refType_refId_accountId_entrySide_key"
  ON "AccountTx"("refType", "refId", "accountId", "entrySide");


-- ============================================================================
-- PaymentDestination dedupe (unique on hash tuple)
-- ============================================================================

-- Drop old non-unique index if present
DROP INDEX IF EXISTS "PaymentDestination_ownerUserId_direction_type_encryptedValueHash_idx";

-- Create unique index (IF NOT EXISTS for safety)
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentDestination_ownerUserId_direction_type_encryptedValueHash_key"
  ON "PaymentDestination"("ownerUserId", "direction", "type", "encryptedValueHash");
