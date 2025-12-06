-- CreateEnum
CREATE TYPE "RemittanceChannel" AS ENUM ('INTERNAL', 'CASH', 'BANK_TRANSFER', 'CARD', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "RemittanceGroupKind" AS ENUM ('TRANSFER', 'SETTLEMENT', 'NETTING', 'PASS_THROUGH', 'OTHER');

-- AlterEnum
ALTER TYPE "RemittanceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

-- AlterTable
ALTER TABLE "RemittanceGroup" ADD COLUMN     "kind" "RemittanceGroupKind" NOT NULL DEFAULT 'TRANSFER';

-- AlterTable
ALTER TABLE "Remittance" ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "channel" "RemittanceChannel" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "externalPaymentRef" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "onBehalfOfUserId" TEXT;

-- CreateTable
CREATE TABLE "RemittanceSettlementLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legId" TEXT NOT NULL,
    "sourceRemittanceId" TEXT NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "note" TEXT,

    CONSTRAINT "RemittanceSettlementLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemittanceSettlementLink_legId_idx" ON "RemittanceSettlementLink"("legId");

-- CreateIndex
CREATE INDEX "RemittanceSettlementLink_sourceRemittanceId_idx" ON "RemittanceSettlementLink"("sourceRemittanceId");

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceSettlementLink" ADD CONSTRAINT "RemittanceSettlementLink_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceSettlementLink" ADD CONSTRAINT "RemittanceSettlementLink_sourceRemittanceId_fkey" FOREIGN KEY ("sourceRemittanceId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
