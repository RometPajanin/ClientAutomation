-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'DUPLICATE', 'ANALYSIS_FAILED');

-- CreateEnum
CREATE TYPE "InquirySource" AS ENUM ('WEB_FORM');

-- CreateEnum
CREATE TYPE "InquiryCategory" AS ENUM ('SALES', 'SUPPORT', 'BILLING', 'COMPLAINT', 'PARTNERSHIP', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "InquiryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InquiryNextAction" AS ENUM ('CREATE_DRAFT', 'REQUEST_MISSING_INFO', 'ASSIGN_TO_SALES', 'ASSIGN_TO_SUPPORT', 'HUMAN_REVIEW', 'MARK_DUPLICATE', 'IGNORE_SPAM');

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'RECEIVED',
    "source" "InquirySource" NOT NULL DEFAULT 'WEB_FORM',
    "sourceReference" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "service" TEXT,
    "message" TEXT NOT NULL,
    "consentToStore" BOOLEAN NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "category" "InquiryCategory",
    "priority" "InquiryPriority",
    "language" TEXT,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "extractedData" JSONB,
    "missingFields" JSONB,
    "riskFlags" JSONB,
    "nextAction" "InquiryNextAction",
    "actionReason" TEXT,
    "responseDraft" TEXT,
    "analysisErrorCode" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "aiPromptVersionId" TEXT,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryEvent" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "companyPrompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_sourceReference_key" ON "Inquiry"("sourceReference");

-- CreateIndex
CREATE INDEX "Inquiry_createdAt_idx" ON "Inquiry"("createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");

-- CreateIndex
CREATE INDEX "Inquiry_category_idx" ON "Inquiry"("category");

-- CreateIndex
CREATE INDEX "Inquiry_priority_idx" ON "Inquiry"("priority");

-- CreateIndex
CREATE INDEX "Inquiry_fingerprint_idx" ON "Inquiry"("fingerprint");

-- CreateIndex
CREATE INDEX "Inquiry_duplicateOfId_idx" ON "Inquiry"("duplicateOfId");

-- CreateIndex
CREATE INDEX "Inquiry_aiPromptVersionId_idx" ON "Inquiry"("aiPromptVersionId");

-- CreateIndex
CREATE INDEX "InquiryEvent_inquiryId_createdAt_idx" ON "InquiryEvent"("inquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptVersion_version_key" ON "AiPromptVersion"("version");

-- CreateIndex
CREATE INDEX "AiPromptVersion_isActive_idx" ON "AiPromptVersion"("isActive");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_aiPromptVersionId_fkey" FOREIGN KEY ("aiPromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvent" ADD CONSTRAINT "InquiryEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
