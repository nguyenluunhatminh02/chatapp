-- CreateEnum
CREATE TYPE "public"."FileStatus" AS ENUM ('UPLOADING', 'READY');

-- CreateTable
CREATE TABLE "public"."FileObject" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER,
    "checksum" TEXT,
    "status" "public"."FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileObject_status_idx" ON "public"."FileObject"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_bucket_key_key" ON "public"."FileObject"("bucket", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_messageId_fileId_key" ON "public"."Attachment"("messageId", "fileId");

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
