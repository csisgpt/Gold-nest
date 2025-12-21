-- Add new policy and KYC primitives
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycStatus') THEN
    CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycLevel') THEN
    CREATE TYPE "KycLevel" AS ENUM ('NONE', 'BASIC', 'FULL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyScopeType') THEN
    CREATE TYPE "PolicyScopeType" AS ENUM ('GLOBAL', 'GROUP', 'USER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyAction') THEN
    CREATE TYPE "PolicyAction" AS ENUM ('WITHDRAW_IRR', 'DEPOSIT_IRR', 'TRADE_BUY', 'TRADE_SELL', 'REMITTANCE_SEND', 'CUSTODY_IN', 'CUSTODY_OUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyMetric') THEN
    CREATE TYPE "PolicyMetric" AS ENUM ('NOTIONAL_IRR', 'WEIGHT_750_G', 'COUNT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyPeriod') THEN
    CREATE TYPE "PolicyPeriod" AS ENUM ('DAILY', 'MONTHLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LimitReservationStatus') THEN
    CREATE TYPE "LimitReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyAuditEntityType') THEN
    CREATE TYPE "PolicyAuditEntityType" AS ENUM ('CUSTOMER_GROUP', 'USER_KYC', 'POLICY_RULE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountReservationStatus') THEN
    CREATE TYPE "AccountReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerGroup" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tahesabGroupName" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerGroup_code_key" UNIQUE ("code")
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customerGroupId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "User_customerGroupId_idx" ON "User"("customerGroupId");

CREATE TABLE IF NOT EXISTS "UserKyc" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "status" "KycStatus" NOT NULL DEFAULT 'NONE',
  "level" "KycLevel" NOT NULL DEFAULT 'NONE',
  "verifiedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  CONSTRAINT "UserKyc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserKyc_userId_key" UNIQUE ("userId"),
  CONSTRAINT "UserKyc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PolicyRule" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scopeType" "PolicyScopeType" NOT NULL,
  "scopeUserId" TEXT,
  "scopeGroupId" TEXT,
  "action" "PolicyAction" NOT NULL,
  "metric" "PolicyMetric" NOT NULL,
  "period" "PolicyPeriod" NOT NULL,
  "limit" DECIMAL(24,6) NOT NULL,
  "minKycLevel" "KycLevel" NOT NULL DEFAULT 'NONE',
  "instrumentId" TEXT,
  "instrumentType" "InstrumentType",
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "note" TEXT,
  CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PolicyRule_scopeUserId_fkey" FOREIGN KEY ("scopeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PolicyRule_scopeGroupId_fkey" FOREIGN KEY ("scopeGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PolicyRule_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PolicyRule_scopeType_scopeUserId_scopeGroupId_idx" ON "PolicyRule"("scopeType", "scopeUserId", "scopeGroupId");
CREATE INDEX IF NOT EXISTS "PolicyRule_action_metric_period_idx" ON "PolicyRule"("action", "metric", "period");
CREATE INDEX IF NOT EXISTS "PolicyRule_instrumentId_instrumentType_idx" ON "PolicyRule"("instrumentId", "instrumentType");

CREATE TABLE IF NOT EXISTS "LimitUsage" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "action" "PolicyAction" NOT NULL,
  "metric" "PolicyMetric" NOT NULL,
  "period" "PolicyPeriod" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "instrumentKey" TEXT,
  "usedAmount" DECIMAL(24,6) NOT NULL DEFAULT 0,
  "reservedAmount" DECIMAL(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "LimitUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LimitUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LimitUsage_userId_action_metric_period_periodKey_instrumentKey_key" ON "LimitUsage"("userId", "action", "metric", "period", "periodKey", COALESCE("instrumentKey", ''));

CREATE TABLE IF NOT EXISTS "LimitReservation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "usageId" TEXT NOT NULL,
  "amount" DECIMAL(24,6) NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "status" "LimitReservationStatus" NOT NULL DEFAULT 'RESERVED',
  CONSTRAINT "LimitReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LimitReservation_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "LimitUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LimitReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LimitReservation_refType_refId_usageId_key" ON "LimitReservation"("refType", "refId", "usageId");

CREATE TABLE IF NOT EXISTS "PolicyAuditLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entityType" "PolicyAuditEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorId" TEXT,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "reason" TEXT,
  CONSTRAINT "PolicyAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PolicyAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PolicyAuditLog_entityType_entityId_idx" ON "PolicyAuditLog"("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "AccountReservation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId" TEXT NOT NULL,
  "amount" DECIMAL(24,6) NOT NULL,
  "refType" "TxRefType" NOT NULL,
  "refId" TEXT NOT NULL,
  "status" "AccountReservationStatus" NOT NULL DEFAULT 'RESERVED',
  CONSTRAINT "AccountReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountReservation_refType_refId_accountId_key" ON "AccountReservation"("refType", "refId", "accountId");
