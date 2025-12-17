-- Ensure deterministic HOUSE user exists before enforcing NOT NULL
DO $$
DECLARE
    v_house_id CONSTANT TEXT := 'house-system-user';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = v_house_id) THEN
        INSERT INTO "User" (id, "createdAt", "updatedAt", "fullName", mobile, password, email, role, status)
        VALUES (
            v_house_id,
            NOW(),
            NOW(),
            'House Account',
            '09999999999',
            '$2b$10$1rC5KTpfKCrj3Ghr/2e3MOl4m2YPSPiJYn/DCz2yNLOUZo8Ag1KmG', -- bcrypt hash for a random strong string
            'house-system@goldnest.local',
            'ADMIN',
            'ACTIVE'
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Point all null accounts to the HOUSE user to satisfy NOT NULL constraint
UPDATE "Account" SET "userId" = 'house-system-user' WHERE "userId" IS NULL;

-- Verify there are no duplicate AccountTx links before adding uniques
DO $$
DECLARE
    v_dup_deposits INT;
    v_dup_withdrawals INT;
BEGIN
    SELECT COUNT(*) INTO v_dup_deposits FROM (
        SELECT "accountTxId" FROM "DepositRequest" WHERE "accountTxId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
    ) t;

    SELECT COUNT(*) INTO v_dup_withdrawals FROM (
        SELECT "accountTxId" FROM "WithdrawRequest" WHERE "accountTxId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
    ) t;

    IF v_dup_deposits > 0 THEN
        RAISE EXCEPTION 'Cannot add unique constraint on DepositRequest.accountTxId: % duplicate value(s) found', v_dup_deposits;
    END IF;

    IF v_dup_withdrawals > 0 THEN
        RAISE EXCEPTION 'Cannot add unique constraint on WithdrawRequest.accountTxId: % duplicate value(s) found', v_dup_withdrawals;
    END IF;
END $$;

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_accountTxId_key" ON "DepositRequest"("accountTxId");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawRequest_accountTxId_key" ON "WithdrawRequest"("accountTxId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
