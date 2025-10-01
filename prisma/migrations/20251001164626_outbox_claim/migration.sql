-- AlterTable
ALTER TABLE "public"."Outbox" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT;

-- CreateIndex
CREATE INDEX "Outbox_claimedAt_publishedAt_idx" ON "public"."Outbox"("claimedAt", "publishedAt");
