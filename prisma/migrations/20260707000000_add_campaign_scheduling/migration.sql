-- AlterTable: add scheduling + call-window columns to campaigns
ALTER TABLE "campaigns" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "windowStart" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "windowEnd" TEXT;
