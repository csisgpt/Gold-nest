-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TRADER', 'CLIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('FIAT', 'GOLD', 'COIN', 'OTHER');

-- CreateEnum
CREATE TYPE "InstrumentUnit" AS ENUM ('GRAM_750_EQ', 'PIECE', 'CURRENCY');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_USER', 'CANCELLED_BY_ADMIN', 'SETTLED');

-- CreateEnum
CREATE TYPE "SettlementMethod" AS ENUM ('WALLET', 'EXTERNAL', 'CASH', 'PHYSICAL', 'MIXED');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('SPOT', 'TOMORROW', 'DAY_AFTER');

-- CreateEnum
CREATE TYPE "CustodyAssetType" AS ENUM ('GOLD');

-- CreateEnum
CREATE TYPE "PhysicalCustodyMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "PhysicalCustodyMovementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxRefType" AS ENUM ('TRADE', 'DEPOSIT', 'WITHDRAW', 'ADJUSTMENT', 'GOLD_LOT', 'REMITTANCE');

-- CreateEnum
CREATE TYPE "AccountTxType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'TRADE_DEBIT', 'TRADE_CREDIT', 'ADJUSTMENT', 'FEE', 'REMITTANCE');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WithdrawStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GoldLotStatus" AS ENUM ('IN_VAULT', 'SOLD', 'WITHDRAWN', 'MELTED');

-- CreateEnum
CREATE TYPE "AttachmentEntityType" AS ENUM ('TRADE', 'DEPOSIT', 'WITHDRAW', 'GOLD_LOT', 'REMITTANCE');

-- CreateEnum
CREATE TYPE "RemittanceGroupStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceChannel" AS ENUM ('INTERNAL', 'CASH', 'BANK_TRANSFER', 'CARD', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "RemittanceGroupKind" AS ENUM ('TRANSFER', 'SETTLEMENT', 'NETTING', 'PASS_THROUGH', 'OTHER');

-- CreateEnum
CREATE TYPE "TahesabOutboxStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "TahesabOutbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TahesabOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    "tahesabFactorCode" TEXT,

    CONSTRAINT "TahesabOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tahesabCustomerCode" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstrumentType" NOT NULL,
    "unit" "InstrumentUnit" NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentPrice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instrumentId" TEXT NOT NULL,
    "buyPrice" DECIMAL(18,4) NOT NULL,
    "sellPrice" DECIMAL(18,4) NOT NULL,
    "source" TEXT,

    CONSTRAINT "InstrumentPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "balance" DECIMAL(24,6) NOT NULL,
    "blockedBalance" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "minBalance" DECIMAL(24,6) NOT NULL DEFAULT 0,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountTx" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "delta" DECIMAL(24,6) NOT NULL,
    "type" "AccountTxType" NOT NULL,
    "refType" "TxRefType" NOT NULL,
    "refId" TEXT,
    "createdById" TEXT,
    "reversalOfId" TEXT,

    CONSTRAINT "AccountTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "type" "TradeType" NOT NULL DEFAULT 'SPOT',
    "settlementMethod" "SettlementMethod" NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "pricePerUnit" DECIMAL(24,6) NOT NULL,
    "totalAmount" DECIMAL(24,6) NOT NULL,
    "entryPrice" DECIMAL(24,8),
    "settlementPrice" DECIMAL(24,8),
    "settlementAmount" DECIMAL(24,2),
    "realizedPnl" DECIMAL(24,2),
    "clientNote" TEXT,
    "adminNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalCustodyPosition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" "CustodyAssetType" NOT NULL DEFAULT 'GOLD',
    "weightGram" DECIMAL(24,4) NOT NULL,
    "ayar" INTEGER NOT NULL,

    CONSTRAINT "PhysicalCustodyPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalCustodyMovement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" "CustodyAssetType" NOT NULL DEFAULT 'GOLD',
    "movementType" "PhysicalCustodyMovementType" NOT NULL,
    "status" "PhysicalCustodyMovementStatus" NOT NULL DEFAULT 'PENDING',
    "weightGram" DECIMAL(24,4) NOT NULL,
    "ayar" INTEGER NOT NULL,
    "tahesabFactorCode" TEXT,
    "note" TEXT,

    CONSTRAINT "PhysicalCustodyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(24,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "refNo" TEXT,
    "note" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "accountTxId" TEXT,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(24,2) NOT NULL,
    "status" "WithdrawStatus" NOT NULL DEFAULT 'PENDING',
    "bankName" TEXT,
    "iban" TEXT,
    "cardNumber" TEXT,
    "note" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "accountTxId" TEXT,

    CONSTRAINT "WithdrawRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "note" TEXT,
    "externalRef" TEXT,
    "kind" "RemittanceGroupKind" NOT NULL DEFAULT 'TRANSFER',
    "status" "RemittanceGroupStatus" NOT NULL DEFAULT 'OPEN',
    "tahesabDocId" TEXT,

    CONSTRAINT "RemittanceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT,
    "instrumentId" TEXT NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "note" TEXT,
    "channel" "RemittanceChannel" NOT NULL DEFAULT 'INTERNAL',
    "iban" TEXT,
    "cardLast4" TEXT,
    "externalPaymentRef" TEXT,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "tahesabDocId" TEXT,
    "fromAccountTxId" TEXT,
    "toAccountTxId" TEXT,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "GoldLot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "grossWeight" DECIMAL(24,6) NOT NULL,
    "karat" INTEGER NOT NULL,
    "equivGram750" DECIMAL(24,6) NOT NULL,
    "status" "GoldLotStatus" NOT NULL DEFAULT 'IN_VAULT',
    "note" TEXT,

    CONSTRAINT "GoldLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,
    "entityType" "AttachmentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "purpose" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TahesabOutbox_method_correlationId_idx" ON "TahesabOutbox"("method", "correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tahesabCustomerCode_key" ON "User"("tahesabCustomerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_code_key" ON "Instrument"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_instrumentId_key" ON "Account"("userId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTx_reversalOfId_key" ON "AccountTx"("reversalOfId");

-- CreateIndex
CREATE INDEX "AccountTx_refType_refId_idx" ON "AccountTx"("refType", "refId");

-- CreateIndex
CREATE INDEX "PhysicalCustodyPosition_userId_assetType_idx" ON "PhysicalCustodyPosition"("userId", "assetType");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalCustodyPosition_userId_assetType_key" ON "PhysicalCustodyPosition"("userId", "assetType");

-- CreateIndex
CREATE INDEX "PhysicalCustodyMovement_userId_assetType_status_idx" ON "PhysicalCustodyMovement"("userId", "assetType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_accountTxId_key" ON "DepositRequest"("accountTxId");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawRequest_accountTxId_key" ON "WithdrawRequest"("accountTxId");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceGroup_externalRef_key" ON "RemittanceGroup"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_fromAccountTxId_key" ON "Remittance"("fromAccountTxId");

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_toAccountTxId_key" ON "Remittance"("toAccountTxId");

-- CreateIndex
CREATE INDEX "RemittanceSettlementLink_legId_idx" ON "RemittanceSettlementLink"("legId");

-- CreateIndex
CREATE INDEX "RemittanceSettlementLink_sourceRemittanceId_idx" ON "RemittanceSettlementLink"("sourceRemittanceId");

-- AddForeignKey
ALTER TABLE "InstrumentPrice" ADD CONSTRAINT "InstrumentPrice_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTx" ADD CONSTRAINT "AccountTx_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTx" ADD CONSTRAINT "AccountTx_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTx" ADD CONSTRAINT "AccountTx_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCustodyPosition" ADD CONSTRAINT "PhysicalCustodyPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCustodyMovement" ADD CONSTRAINT "PhysicalCustodyMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_accountTxId_fkey" FOREIGN KEY ("accountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_accountTxId_fkey" FOREIGN KEY ("accountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceGroup" ADD CONSTRAINT "RemittanceGroup_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RemittanceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_fromAccountTxId_fkey" FOREIGN KEY ("fromAccountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_toAccountTxId_fkey" FOREIGN KEY ("toAccountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceSettlementLink" ADD CONSTRAINT "RemittanceSettlementLink_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceSettlementLink" ADD CONSTRAINT "RemittanceSettlementLink_sourceRemittanceId_fkey" FOREIGN KEY ("sourceRemittanceId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLot" ADD CONSTRAINT "GoldLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

