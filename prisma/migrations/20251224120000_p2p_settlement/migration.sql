-- Add enums
CREATE TYPE "RequestPurpose" AS ENUM ('DIRECT', 'P2P');
CREATE TYPE "P2PConfirmationMode" AS ENUM ('RECEIVER', 'ADMIN', 'BOTH');
CREATE TYPE "PaymentDestinationDirection" AS ENUM ('PAYOUT', 'COLLECTION');
CREATE TYPE "PaymentDestinationType" AS ENUM ('IBAN', 'CARD', 'ACCOUNT');
CREATE TYPE "PaymentDestinationStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFY', 'DISABLED');
CREATE TYPE "P2PAllocationStatus" AS ENUM (
  'ASSIGNED',
  'PROOF_SUBMITTED',
  'RECEIVER_CONFIRMED',
  'ADMIN_VERIFIED',
  'SETTLED',
  'DISPUTED',
  'CANCELLED',
  'EXPIRED'
);

ALTER TYPE "TxRefType" ADD VALUE IF NOT EXISTS 'WITHDRAW_ALLOCATION';

-- Alter existing tables
ALTER TABLE "DepositRequest"
  ADD COLUMN "purpose" "RequestPurpose" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "remainingAmount" DECIMAL(24,2),
  ADD COLUMN "assignedAmountTotal" DECIMAL(24,2) NOT NULL DEFAULT 0,
  ADD COLUMN "settledAmountTotal" DECIMAL(24,2) NOT NULL DEFAULT 0;

ALTER TABLE "WithdrawRequest"
  ADD COLUMN "purpose" "RequestPurpose" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "payoutDestinationId" TEXT,
  ADD COLUMN "destinationSnapshot" JSONB,
  ADD COLUMN "assignedAmountTotal" DECIMAL(24,2) NOT NULL DEFAULT 0,
  ADD COLUMN "settledAmountTotal" DECIMAL(24,2) NOT NULL DEFAULT 0;

-- Payment destinations
CREATE TABLE "PaymentDestination" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "ownerUserId" TEXT,
  "direction" "PaymentDestinationDirection" NOT NULL,
  "type" "PaymentDestinationType" NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "encryptedValueHash" TEXT NOT NULL,
  "maskedValue" TEXT NOT NULL,
  "bankName" TEXT,
  "ownerName" TEXT,
  "title" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "PaymentDestinationStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "PaymentDestination_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentDestination_ownerUserId_direction_status_idx" ON "PaymentDestination"("ownerUserId", "direction", "status");

-- P2P allocations
CREATE TABLE "P2PAllocation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "depositId" TEXT NOT NULL,
  "amount" DECIMAL(24,2) NOT NULL,
  "status" "P2PAllocationStatus" NOT NULL DEFAULT 'ASSIGNED',
  "paymentCode" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "destinationSnapshot" JSONB NOT NULL,
  "payerBankRef" TEXT,
  "payerProofFileId" TEXT,
  "payerPaidAt" TIMESTAMP(3),
  "receiverConfirmedAt" TIMESTAMP(3),
  "receiverDisputedAt" TIMESTAMP(3),
  "receiverDisputeReason" TEXT,
  "adminVerifiedAt" TIMESTAMP(3),
  "adminVerifierId" TEXT,
  "settledAt" TIMESTAMP(3),
  "withdrawerAccountTxId" TEXT,
  "payerAccountTxId" TEXT,

  CONSTRAINT "P2PAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "P2PAllocation_paymentCode_key" ON "P2PAllocation"("paymentCode");
CREATE INDEX "P2PAllocation_withdrawalId_status_idx" ON "P2PAllocation"("withdrawalId", "status");
CREATE INDEX "P2PAllocation_depositId_status_idx" ON "P2PAllocation"("depositId", "status");
CREATE INDEX "P2PAllocation_expiresAt_idx" ON "P2PAllocation"("expiresAt");

-- Idempotency
CREATE TABLE "P2PAssignmentIdempotency" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "key" TEXT NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "responseJson" JSONB NOT NULL,

  CONSTRAINT "P2PAssignmentIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "P2PAssignmentIdempotency_key_withdrawalId_key" ON "P2PAssignmentIdempotency"("key", "withdrawalId");

-- FKs
ALTER TABLE "WithdrawRequest"
  ADD CONSTRAINT "WithdrawRequest_payoutDestinationId_fkey" FOREIGN KEY ("payoutDestinationId") REFERENCES "PaymentDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentDestination"
  ADD CONSTRAINT "PaymentDestination_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "P2PAllocation"
  ADD CONSTRAINT "P2PAllocation_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "P2PAllocation"
  ADD CONSTRAINT "P2PAllocation_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "DepositRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
