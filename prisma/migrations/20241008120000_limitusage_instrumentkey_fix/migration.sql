-- Fix LimitUsage instrumentKey to be non-null with default and proper unique index
UPDATE "LimitUsage" SET "instrumentKey" = 'ALL' WHERE "instrumentKey" IS NULL;

ALTER TABLE "LimitUsage" ALTER COLUMN "instrumentKey" SET DEFAULT 'ALL';
ALTER TABLE "LimitUsage" ALTER COLUMN "instrumentKey" SET NOT NULL;

DROP INDEX IF EXISTS "LimitUsage_userId_action_metric_period_periodKey_instrumentKey_key";
CREATE UNIQUE INDEX "LimitUsage_userId_action_metric_period_periodKey_instrumentKey_key"
  ON "LimitUsage"("userId", "action", "metric", "period", "periodKey", "instrumentKey");
