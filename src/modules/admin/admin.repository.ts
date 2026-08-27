import {
  Prisma,
  type PrismaClient
} from "../../generated/prisma/client.js";
import type { AdminInquiryListQuery } from "./admin.schemas.js";

const adminListSelect = {
  id: true,
  createdAt: true,
  name: true,
  email: true,
  phone: true,
  service: true,
  message: true,
  category: true,
  priority: true,
  summary: true,
  replyRecommended: true,
  responseDraft: true,
  status: true,
  confidence: true,
  extractedData: true
} satisfies Prisma.InquirySelect;

const adminDetailSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  source: true,
  sourceReference: true,
  name: true,
  email: true,
  phone: true,
  service: true,
  message: true,
  consentToStore: true,
  category: true,
  priority: true,
  sentiment: true,
  language: true,
  confidence: true,
  summary: true,
  extractedData: true,
  missingFields: true,
  riskFlags: true,
  nextAction: true,
  actionReason: true,
  replyRecommended: true,
  replyRecommendationReason: true,
  responseDraft: true,
  analysisErrorCode: true,
  analyzedAt: true,
  duplicateOf: {
    select: {
      id: true,
      createdAt: true,
      status: true,
      name: true,
      email: true
    }
  },
  aiPromptVersion: {
    select: {
      id: true,
      version: true,
      companyPrompt: true,
      createdAt: true
    }
  },
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      metadata: true,
      createdAt: true
    }
  }
} satisfies Prisma.InquirySelect;

export type AdminInquiryListRecord =
  Prisma.InquiryGetPayload<{
    select: typeof adminListSelect;
  }>;

export type AdminInquiryDetailRecord =
  Prisma.InquiryGetPayload<{
    select: typeof adminDetailSelect;
  }>;

function buildWhere(
  query: AdminInquiryListQuery
): Prisma.InquiryWhereInput {
  return {
    status: query.status,
    category: query.category,
    priority: query.priority,
    replyRecommended: query.replyRecommended,
    createdAt:
      query.createdFrom || query.createdTo
        ? {
            gte: query.createdFrom,
            lte: query.createdTo
          }
        : undefined,
    OR: query.search
      ? [
          {
            name: {
              contains: query.search,
              mode: "insensitive"
            }
          },
          {
            email: {
              contains: query.search,
              mode: "insensitive"
            }
          },
          {
            message: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        ]
      : undefined
  };
}

function buildOrderBy(
  query: AdminInquiryListQuery
): Prisma.InquiryOrderByWithRelationInput[] {
  const direction = query.sortOrder;
  let primary: Prisma.InquiryOrderByWithRelationInput;

  // Public sort names are mapped explicitly so arbitrary columns cannot be queried.
  switch (query.sortBy) {
    case "customerName":
      primary = { name: direction };
      break;
    case "requestedService":
      primary = { service: direction };
      break;
    case "category":
      primary = { category: direction };
      break;
    case "priority":
      primary = { priority: direction };
      break;
    case "status":
      primary = { status: direction };
      break;
    default:
      primary = { createdAt: direction };
  }

  return [primary, { id: direction }];
}

export class AdminInquiryRepository {
  public constructor(
    private readonly prisma: PrismaClient
  ) {}

  public async list(query: AdminInquiryListQuery): Promise<{
    records: AdminInquiryListRecord[];
    total: number;
  }> {
    const where = buildWhere(query);

    // Count and page use the identical filter inside one database transaction.
    const [total, records] = await this.prisma.$transaction([
      this.prisma.inquiry.count({ where }),
      this.prisma.inquiry.findMany({
        where,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: adminListSelect
      })
    ]);

    return { records, total };
  }

  public async findById(
    inquiryId: string
  ): Promise<AdminInquiryDetailRecord | null> {
    return this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: adminDetailSelect
    });
  }
}
