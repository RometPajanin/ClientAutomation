import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  InquiryNextAction,
  InquiryStatus
} from "../../generated/prisma/enums.js";
import type { NormalizedInquiry } from "./inquiry.normalization.js";

export interface StoredInquirySummary {
  id: string;
  status: InquiryStatus;
}

export interface CreateStoredInquiryInput {
  inquiry: NormalizedInquiry;
  fingerprint: string;
  duplicateOfId?: string;
}

export class InquiryRepository {
  public constructor(
    private readonly prisma: PrismaClient
  ) {}

  public async findBySourceReference(
    sourceReference: string
  ): Promise<StoredInquirySummary | null> {
    return this.prisma.inquiry.findUnique({
      where: { sourceReference },
      select: {
        id: true,
        status: true
      }
    });
  }

  // Duplicate candidates must be recent original inquiries, not earlier duplicates.
  public async findRecentOriginalByFingerprint(
    fingerprint: string,
    createdAfter: Date
  ): Promise<{ id: string } | null> {
    return this.prisma.inquiry.findFirst({
      where: {
        fingerprint,
        duplicateOfId: null,
        createdAt: { gte: createdAfter }
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
  }

  public async create(
    input: CreateStoredInquiryInput
  ): Promise<StoredInquirySummary> {
    const isDuplicate = input.duplicateOfId !== undefined;

    // Prisma nested writes store the inquiry and audit events atomically.
    return this.prisma.inquiry.create({
      data: {
        ...input.inquiry,
        fingerprint: input.fingerprint,
        status: isDuplicate
          ? InquiryStatus.DUPLICATE
          : InquiryStatus.RECEIVED,
        duplicateOfId: input.duplicateOfId,
        nextAction: isDuplicate
          ? InquiryNextAction.MARK_DUPLICATE
          : undefined,
        actionReason: isDuplicate
          ? "An equivalent inquiry from the same contact was received recently."
          : undefined,
        events: {
          create: [
            {
              type: "RECEIVED",
              metadata: {
                source: "WEB_FORM"
              }
            },
            ...(isDuplicate
              ? [
                  {
                    type: "MARKED_DUPLICATE",
                    metadata: {
                      duplicateOfId: input.duplicateOfId
                    }
                  }
                ]
              : [])
          ]
        }
      },
      select: {
        id: true,
        status: true
      }
    });
  }
}
