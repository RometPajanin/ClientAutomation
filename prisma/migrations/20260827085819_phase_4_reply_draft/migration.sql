-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "replyRecommendationReason" TEXT,
ADD COLUMN     "replyRecommended" BOOLEAN;

-- CreateIndex
CREATE INDEX "Inquiry_replyRecommended_idx" ON "Inquiry"("replyRecommended");
