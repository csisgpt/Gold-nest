-- Add product selector to PolicyRule
ALTER TABLE "PolicyRule" ADD COLUMN "productId" TEXT;

ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PolicyRule_scopeType_scopeGroupId_scopeUserId_productId_idx"
  ON "PolicyRule"("scopeType", "scopeGroupId", "scopeUserId", "productId");

CREATE INDEX "PolicyRule_productId_action_metric_period_idx"
  ON "PolicyRule"("productId", "action", "metric", "period");
