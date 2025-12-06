-- CreateEnum
CREATE TYPE "RemittanceGroupStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RemittanceGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "note" TEXT,
    "externalRef" TEXT,
    "status" "RemittanceGroupStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "RemittanceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceGroup_externalRef_key" ON "RemittanceGroup"("externalRef");

-- AlterTable
ALTER TABLE "Remittance" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "RemittanceGroup" ADD CONSTRAINT "RemittanceGroup_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RemittanceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
