-- CreateTable
CREATE TABLE "public"."ReadReceipt" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadReceipt_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "ReadReceipt_userId_idx" ON "public"."ReadReceipt"("userId");

-- AddForeignKey
ALTER TABLE "public"."ReadReceipt" ADD CONSTRAINT "ReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
