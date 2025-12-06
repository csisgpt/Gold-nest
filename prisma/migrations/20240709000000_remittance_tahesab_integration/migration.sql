-- Remittance Tahesab integration
ALTER TABLE "RemittanceGroup" ADD COLUMN "tahesabDocId" TEXT;
ALTER TABLE "Remittance" ADD COLUMN "tahesabDocId" TEXT;
