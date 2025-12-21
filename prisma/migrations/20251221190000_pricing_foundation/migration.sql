-- CreateEnum
CREATE TYPE "MarketProductType" AS ENUM ('CASH', 'GOLD', 'COIN', 'FX', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingOverrideMode" AS ENUM ('ABSOLUTE', 'DELTA_BPS', 'DELTA_AMOUNT');

-- CreateTable
CREATE TABLE "MarketProduct" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "productType" "MarketProductType" NOT NULL,
    "tradeType" "TradeType" NOT NULL,
    "baseInstrumentId" TEXT NOT NULL,
    "unitType" "PolicyMetric" NOT NULL,
    "groupKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metaJson" JSONB,

    CONSTRAINT "MarketProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceProvider" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportsStreaming" BOOLEAN NOT NULL DEFAULT false,
    "defaultPollIntervalSec" INTEGER,
    "authJson" JSONB,

    CONSTRAINT "PriceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProviderMapping" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerSymbol" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "metaJson" JSONB,

    CONSTRAINT "ProductProviderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPriceOverride" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" "PricingOverrideMode" NOT NULL,
    "buyAbsolute" DECIMAL(24,6),
    "sellAbsolute" DECIMAL(24,6),
    "buyDeltaBps" INTEGER,
    "sellDeltaBps" INTEGER,
    "buyDeltaAmount" DECIMAL(24,6),
    "sellDeltaAmount" DECIMAL(24,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" TEXT,

    CONSTRAINT "AdminPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "showBalances" BOOLEAN NOT NULL DEFAULT true,
    "showGold" BOOLEAN NOT NULL DEFAULT true,
    "showCoins" BOOLEAN NOT NULL DEFAULT true,
    "showCash" BOOLEAN NOT NULL DEFAULT true,
    "tradeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "withdrawEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxOpenTrades" INTEGER,
    "metaJson" JSONB,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketProduct_code_key" ON "MarketProduct"("code");

-- CreateIndex
CREATE INDEX "MarketProduct_isActive_groupKey_sortOrder_idx" ON "MarketProduct"("isActive", "groupKey", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PriceProvider_key_key" ON "PriceProvider"("key");

-- CreateIndex
CREATE INDEX "ProductProviderMapping_productId_isEnabled_priority_idx" ON "ProductProviderMapping"("productId", "isEnabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProviderMapping_productId_providerId_key" ON "ProductProviderMapping"("productId", "providerId");

-- CreateIndex
CREATE INDEX "AdminPriceOverride_productId_isActive_expiresAt_idx" ON "AdminPriceOverride"("productId", "isActive", "expiresAt");

-- AddForeignKey
ALTER TABLE "MarketProduct" ADD CONSTRAINT "MarketProduct_baseInstrumentId_fkey" FOREIGN KEY ("baseInstrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProviderMapping" ADD CONSTRAINT "ProductProviderMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProviderMapping" ADD CONSTRAINT "ProductProviderMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PriceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPriceOverride" ADD CONSTRAINT "AdminPriceOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPriceOverride" ADD CONSTRAINT "AdminPriceOverride_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPriceOverride" ADD CONSTRAINT "AdminPriceOverride_revokedByAdminId_fkey" FOREIGN KEY ("revokedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

