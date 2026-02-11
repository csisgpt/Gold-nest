-- CreateEnum
ALTER TYPE "AttachmentEntityType" ADD VALUE IF NOT EXISTS 'KYC';

-- AlterEnum
ALTER TYPE "PolicyAuditEntityType" ADD VALUE IF NOT EXISTS 'CUSTOMER_GROUP_SETTINGS';
ALTER TYPE "PolicyAuditEntityType" ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE "PolicyAuditEntityType" ADD VALUE IF NOT EXISTS 'ACCOUNT_ADJUSTMENT';

-- CreateTable
CREATE TABLE "CustomerGroupSettings" (
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "showBalances" BOOLEAN,
    "showGold" BOOLEAN,
    "showCoins" BOOLEAN,
    "showCash" BOOLEAN,
    "tradeEnabled" BOOLEAN,
    "withdrawEnabled" BOOLEAN,
    "maxOpenTrades" INTEGER,
    "metaJson" JSONB,

    CONSTRAINT "CustomerGroupSettings_pkey" PRIMARY KEY ("groupId")
);

-- AddForeignKey
ALTER TABLE "CustomerGroupSettings" ADD CONSTRAINT "CustomerGroupSettings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
