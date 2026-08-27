-- CreateEnum
CREATE TYPE "InquirySentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED');

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "aiSuggestedAction" "InquiryNextAction",
ADD COLUMN     "aiSuggestedActionReason" TEXT,
ADD COLUMN     "sentiment" "InquirySentiment";
