-- AlterTable
ALTER TABLE "AccountTx" ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "reversedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "AccountTx_reversalOfId_key" ON "AccountTx"("reversalOfId");

-- AddForeignKey
ALTER TABLE "AccountTx" ADD CONSTRAINT "AccountTx_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountTx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

