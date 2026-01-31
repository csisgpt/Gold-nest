-- AccountTx entry side for idempotent ledger entries
DO $$ BEGIN
  CREATE TYPE "AccountTxEntrySide" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AccountTx"
  ADD COLUMN "entrySide" "AccountTxEntrySide" NOT NULL DEFAULT 'CREDIT';

UPDATE "AccountTx"
SET "entrySide" = CASE WHEN "delta" < 0 THEN 'DEBIT' ELSE 'CREDIT' END;

ALTER TABLE "AccountTx"
  ALTER COLUMN "entrySide" DROP DEFAULT;

DROP INDEX IF EXISTS "AccountTx_refType_refId_accountId_key";

CREATE UNIQUE INDEX "AccountTx_refType_refId_accountId_entrySide_key"
  ON "AccountTx"("refType", "refId", "accountId", "entrySide");

-- PaymentDestination dedupe
DROP INDEX IF EXISTS "PaymentDestination_ownerUserId_direction_type_encryptedValueHash_idx";

CREATE UNIQUE INDEX "PaymentDestination_ownerUserId_direction_type_encryptedValueHash_key"
  ON "PaymentDestination"("ownerUserId", "direction", "type", "encryptedValueHash");
