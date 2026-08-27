-- DropIndex
DROP INDEX "Inquiry_fingerprint_idx";

-- CreateIndex
CREATE INDEX "Inquiry_fingerprint_createdAt_idx" ON "Inquiry"("fingerprint", "createdAt");
