-- Add index for AccountTx refType/refId to improve query performance
CREATE INDEX "AccountTx_refType_refId_idx" ON "AccountTx"("refType", "refId");

-- Add missing relations from DepositRequest/WithdrawRequest to AccountTx
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_accountTxId_fkey" FOREIGN KEY ("accountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_accountTxId_fkey" FOREIGN KEY ("accountTxId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;
