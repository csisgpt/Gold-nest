-- Add new tx reference and type enums if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'TxRefType' AND e.enumlabel = 'PHYSICAL_CUSTODY_MOVEMENT'
  ) THEN
    ALTER TYPE "TxRefType" ADD VALUE 'PHYSICAL_CUSTODY_MOVEMENT';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AccountTxType' AND e.enumlabel = 'CUSTODY'
  ) THEN
    ALTER TYPE "AccountTxType" ADD VALUE 'CUSTODY';
  END IF;
END $$;

-- Extend physical custody movement for standardized grams and wallet linkage
ALTER TABLE "PhysicalCustodyMovement"
  ADD COLUMN IF NOT EXISTS "equivGram750" DECIMAL(24,6),
  ADD COLUMN IF NOT EXISTS "userGoldAccountTxId" TEXT,
  ADD COLUMN IF NOT EXISTS "houseGoldAccountTxId" TEXT;

-- Extend custody positions with standardized balance
ALTER TABLE "PhysicalCustodyPosition"
  ADD COLUMN IF NOT EXISTS "equivGram750" DECIMAL(24,6) NOT NULL DEFAULT 0;

-- Backfill standardized grams for existing rows
UPDATE "PhysicalCustodyMovement"
SET "equivGram750" = ("weightGram" * "ayar") / 750
WHERE "equivGram750" IS NULL;

UPDATE "PhysicalCustodyPosition"
SET "equivGram750" = ("weightGram" * "ayar") / 750;

-- Normalize position records to 750-equivalent grams going forward
UPDATE "PhysicalCustodyPosition"
SET "weightGram" = "equivGram750",
    "ayar" = 750;
