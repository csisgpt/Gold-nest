-- Cleanup any legacy policy rules that may have conflicting selectors
UPDATE "PolicyRule"
SET "instrumentId" = NULL, "instrumentType" = NULL
WHERE "productId" IS NOT NULL AND ("instrumentId" IS NOT NULL OR "instrumentType" IS NOT NULL);
