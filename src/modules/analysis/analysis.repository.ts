import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  InquiryNextAction,
  InquiryStatus
} from "../../generated/prisma/enums.js";
import type { AnalysisProviderErrorCode } from "./analysis.provider.js";
import type { AnalysisOutput } from "./analysis.schema.js";

export interface ClaimedInquiry {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  message: string;
  companyPrompt: string;
  promptVersionId: string | null;
  promptVersion: number | null;
}

export interface FailAnalysisInput {
  inquiryId: string;
  errorCode: AnalysisProviderErrorCode;
  retryable: boolean;
}

export class AnalysisRepository {
  public constructor(
    private readonly prisma: PrismaClient
  ) {}

  public async claimInquiry(
    inquiryId: string
  ): Promise<ClaimedInquiry | null> {
    return this.prisma.$transaction(async (transaction) => {
      // Pin the active immutable prompt version before calling the provider.
      const promptVersion =
        await transaction.aiPromptVersion.findFirst({
          where: { isActive: true },
          orderBy: [
            { version: "desc" },
            { createdAt: "desc" }
          ],
          select: {
            id: true,
            version: true,
            companyPrompt: true
          }
        });

      // updateMany provides an atomic status guard: only one worker can claim it.
      const claimed = await transaction.inquiry.updateMany({
        where: {
          id: inquiryId,
          status: InquiryStatus.RECEIVED,
          duplicateOfId: null
        },
        data: {
          status: InquiryStatus.PROCESSING,
          aiPromptVersionId: promptVersion?.id ?? null,
          analysisErrorCode: null
        }
      });

      if (claimed.count === 0) {
        return null;
      }

      await transaction.inquiryEvent.create({
        data: {
          inquiryId,
          type: "ANALYSIS_STARTED",
          metadata: {
            promptVersion: promptVersion?.version ?? null
          }
        }
      });

      const inquiry =
        await transaction.inquiry.findUniqueOrThrow({
          where: { id: inquiryId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            service: true,
            message: true
          }
        });

      return {
        ...inquiry,
        companyPrompt: promptVersion?.companyPrompt ?? "",
        promptVersionId: promptVersion?.id ?? null,
        promptVersion: promptVersion?.version ?? null
      };
    });
  }

  // A successful result and its audit event are one atomic database operation.
  public async completeAnalysis(
    inquiryId: string,
    analysis: AnalysisOutput,
    analyzedAt: Date
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const completed = await transaction.inquiry.updateMany({
        where: {
          id: inquiryId,
          status: InquiryStatus.PROCESSING
        },
        data: {
          status: InquiryStatus.READY,
          category: analysis.category,
          priority: analysis.priority,
          sentiment: analysis.sentiment,
          language: analysis.language,
          confidence: analysis.confidence,
          summary: analysis.extracted.summary,
          extractedData: analysis.extracted,
          missingFields: analysis.missingFields,
          riskFlags: analysis.riskFlags,
          replyRecommended: analysis.reply.recommended,
          replyRecommendationReason: analysis.reply.reason,
          responseDraft: analysis.reply.draft,
          // Human review is an application invariant, not a model decision.
          nextAction: InquiryNextAction.HUMAN_REVIEW,
          actionReason:
            "Every AI-analyzed inquiry requires human review before any response or action.",
          analysisErrorCode: null,
          analyzedAt
        }
      });

      if (completed.count === 0) {
        return false;
      }

      // Audit metadata contains classifications, never the full customer text.
      await transaction.inquiryEvent.create({
        data: {
          inquiryId,
          type: "ANALYSIS_COMPLETED",
          metadata: {
            category: analysis.category,
            priority: analysis.priority,
            confidence: analysis.confidence,
            replyRecommended: analysis.reply.recommended,
            hasDraft: analysis.reply.draft !== null,
            missingFieldCount: analysis.missingFields.length,
            riskFlagCount: analysis.riskFlags.length
          }
        }
      });

      await transaction.inquiryEvent.create({
        data: {
          inquiryId,
          type:
            analysis.reply.draft === null
              ? "REPLY_NOT_RECOMMENDED"
              : "DRAFT_CREATED",
          metadata:
            analysis.reply.draft === null
              ? { replyRecommended: false }
              : {
                  replyRecommended: true,
                  characterCount: analysis.reply.draft.length
                }
        }
      });

      return true;
    });
  }

  // Failure storage deliberately keeps only a stable code and retryability flag.
  public async failAnalysis(
    input: FailAnalysisInput
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const failed = await transaction.inquiry.updateMany({
        where: {
          id: input.inquiryId,
          status: InquiryStatus.PROCESSING
        },
        data: {
          status: InquiryStatus.ANALYSIS_FAILED,
          analysisErrorCode: input.errorCode
        }
      });

      if (failed.count === 0) {
        return false;
      }

      await transaction.inquiryEvent.create({
        data: {
          inquiryId: input.inquiryId,
          type: "ANALYSIS_FAILED",
          metadata: {
            errorCode: input.errorCode,
            retryable: input.retryable
          }
        }
      });

      return true;
    });
  }
}
