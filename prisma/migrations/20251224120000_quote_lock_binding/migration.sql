-- CreateEnum
CREATE TYPE "QuoteSourceType" AS ENUM ('PROVIDER', 'OVERRIDE');

-- AlterTable Trade
ALTER TABLE "Trade"
  ADD COLUMN "quoteId" TEXT,
  ADD COLUMN "executedPrice" DECIMAL(24,6),
  ADD COLUMN "priceSourceType" "QuoteSourceType",
  ADD COLUMN "priceSourceKey" TEXT,
  ADD COLUMN "priceSourceAsOf" TIMESTAMP(3),
  ADD COLUMN "priceSourceRefId" TEXT,
  ADD COLUMN "lockedBaseBuy" DECIMAL(24,6),
  ADD COLUMN "lockedBaseSell" DECIMAL(24,6),
  ADD COLUMN "lockedDisplayBuy" DECIMAL(24,6),
  ADD COLUMN "lockedDisplaySell" DECIMAL(24,6);

-- CreateTable QuoteLockAudit
CREATE TABLE "QuoteLockAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "metric" "PolicyMetric" NOT NULL,
    "baseInstrumentId" TEXT NOT NULL,
    "baseInstrumentCode" TEXT NOT NULL,
    "displayBuy" DECIMAL(24,6),
    "displaySell" DECIMAL(24,6),
    "baseBuy" DECIMAL(24,6),
    "baseSell" DECIMAL(24,6),
    "sourceType" "QuoteSourceType",
    "sourceProviderKey" TEXT,
    "sourceOverrideId" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "tradeId" TEXT,
    CONSTRAINT "QuoteLockAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLockAudit_quoteId_key" ON "QuoteLockAudit"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteLockAudit" ADD CONSTRAINT "QuoteLockAudit_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
