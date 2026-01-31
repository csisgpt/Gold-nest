-- Enums
CREATE TYPE "RequestPurpose" AS ENUM ('DIRECT', 'P2P');
CREATE TYPE "P2PConfirmationMode" AS ENUM ('RECEIVER', 'ADMIN', 'BOTH');
CREATE TYPE "PaymentDestinationDirection" AS ENUM ('PAYOUT', 'COLLECTION');
CREATE TYPE "PaymentDestinationType" AS ENUM ('IBAN', 'CARD', 'ACCOUNT');
CREATE TYPE "PaymentDestinationStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFY', 'DISABLED');
CREATE TYPE "WithdrawalChannel" AS ENUM ('USER_TO_USER', 'USER_TO_ORG');
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_TO_CARD', 'SATNA', 'PAYA', 'TRANSFER', 'UNKNOWN');
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
CREATE TYPE "AttachmentLinkEntityType" AS ENUM ('P2P_ALLOCATION', 'WITHDRAWAL', 'DEPOSIT', 'REMITTANCE');
CREATE TYPE "AttachmentLinkKind" AS ENUM ('P2P_PROOF', 'DISPUTE_EVIDENCE', 'ADMIN_NOTE', 'OTHER');

ALTER TYPE "TxRefType" ADD VALUE IF NOT EXISTS 'WITHDRAW_ALLOCATION';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'WAITING_ASSIGNMENT';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_ASSIGNED';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'FULLY_ASSIGNED';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_SETTLED';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'VALIDATED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'WAITING_ASSIGNMENT';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_ASSIGNED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'FULLY_ASSIGNED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_SETTLED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE "WithdrawStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Extend DepositRequest
ALTER TABLE "DepositRequest"
  ADD COLUMN "purpose" "RequestPurpose" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "remainingAmount" DECIMAL(18,0),
  ADD COLUMN "assignedAmountTotal" DECIMAL(18,0) NOT NULL DEFAULT 0,
  ADD COLUMN "settledAmountTotal" DECIMAL(18,0) NOT NULL DEFAULT 0;

ALTER TABLE "DepositRequest"
  ALTER COLUMN "amount" TYPE DECIMAL(18,0);

-- Extend WithdrawRequest
ALTER TABLE "WithdrawRequest"
  ADD COLUMN "purpose" "RequestPurpose" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "channel" "WithdrawalChannel",
  ADD COLUMN "payoutDestinationId" TEXT,
  ADD COLUMN "destinationSnapshot" JSONB,
  ADD COLUMN "assignedAmountTotal" DECIMAL(18,0) NOT NULL DEFAULT 0,
  ADD COLUMN "settledAmountTotal" DECIMAL(18,0) NOT NULL DEFAULT 0;

ALTER TABLE "WithdrawRequest"
  ALTER COLUMN "amount" TYPE DECIMAL(18,0);

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
CREATE INDEX "PaymentDestination_ownerUserId_direction_type_hash_idx" ON "PaymentDestination"("ownerUserId", "direction", "type", "encryptedValueHash");

-- P2P allocations
CREATE TABLE "P2PAllocation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "depositId" TEXT NOT NULL,
  "amount" DECIMAL(18,0) NOT NULL,
  "status" "P2PAllocationStatus" NOT NULL DEFAULT 'ASSIGNED',
  "paymentCode" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "destinationSnapshot" JSONB NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UNKNOWN',
  "payerBankRef" TEXT,
  "proofSubmittedAt" TIMESTAMP(3),
  "payerPaidAt" TIMESTAMP(3),
  "receiverConfirmedAt" TIMESTAMP(3),
  "receiverDisputedAt" TIMESTAMP(3),
  "receiverDisputeReason" TEXT,
  "adminVerifiedAt" TIMESTAMP(3),
  "adminVerifierId" TEXT,
  "adminNote" TEXT,
  "settledAt" TIMESTAMP(3),
  "withdrawerAccountTxId" TEXT,
  "payerAccountTxId" TEXT,

  CONSTRAINT "P2PAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "P2PAllocation_paymentCode_key" ON "P2PAllocation"("paymentCode");
CREATE INDEX "P2PAllocation_withdrawalId_status_idx" ON "P2PAllocation"("withdrawalId", "status");
CREATE INDEX "P2PAllocation_depositId_status_idx" ON "P2PAllocation"("depositId", "status");
CREATE INDEX "P2PAllocation_expiresAt_idx" ON "P2PAllocation"("expiresAt");
CREATE INDEX "P2PAllocation_status_expiresAt_idx" ON "P2PAllocation"("status", "expiresAt");

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

-- Attachment links
CREATE TABLE "AttachmentLink" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entityType" "AttachmentLinkEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "kind" "AttachmentLinkKind" NOT NULL,
  "fileId" TEXT NOT NULL,
  "uploaderUserId" TEXT,

  CONSTRAINT "AttachmentLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttachmentLink_entityType_entityId_idx" ON "AttachmentLink"("entityType", "entityId");
CREATE INDEX "AttachmentLink_fileId_idx" ON "AttachmentLink"("fileId");
CREATE INDEX "AttachmentLink_kind_idx" ON "AttachmentLink"("kind");

-- Indices for requests
CREATE INDEX "DepositRequest_purpose_status_createdAt_idx" ON "DepositRequest"("purpose", "status", "createdAt");
CREATE INDEX "DepositRequest_userId_createdAt_idx" ON "DepositRequest"("userId", "createdAt");
CREATE INDEX "WithdrawRequest_purpose_status_createdAt_idx" ON "WithdrawRequest"("purpose", "status", "createdAt");
CREATE INDEX "WithdrawRequest_userId_createdAt_idx" ON "WithdrawRequest"("userId", "createdAt");

-- AccountTx unique guard
CREATE UNIQUE INDEX "AccountTx_refType_refId_accountId_key" ON "AccountTx"("refType", "refId", "accountId");

-- FKs
ALTER TABLE "WithdrawRequest"
  ADD CONSTRAINT "WithdrawRequest_payoutDestinationId_fkey" FOREIGN KEY ("payoutDestinationId") REFERENCES "PaymentDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentDestination"
  ADD CONSTRAINT "PaymentDestination_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "P2PAllocation"
  ADD CONSTRAINT "P2PAllocation_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "P2PAllocation"
  ADD CONSTRAINT "P2PAllocation_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "DepositRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttachmentLink"
  ADD CONSTRAINT "AttachmentLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttachmentLink"
  ADD CONSTRAINT "AttachmentLink_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
