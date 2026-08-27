import { AppError } from "../../shared/errors.js";
import {
  AdminInquiryRepository,
  type AdminInquiryDetailRecord,
  type AdminInquiryListRecord
} from "./admin.repository.js";
import type { AdminInquiryListQuery } from "./admin.schemas.js";

function readExtractedString(
  extractedData: unknown,
  field: string
): string | null {
  if (
    typeof extractedData !== "object" ||
    extractedData === null ||
    Array.isArray(extractedData)
  ) {
    return null;
  }

  const value = (extractedData as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0
    ? value
    : null;
}

function createMessagePreview(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();

  return singleLine.length <= 160
    ? singleLine
    : `${singleLine.slice(0, 157)}...`;
}

function toTableRow(record: AdminInquiryListRecord) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    customerName:
      record.name ??
      readExtractedString(record.extractedData, "name") ??
      "Unknown",
    contact: record.email ?? record.phone ?? "Unavailable",
    requestedService:
      record.service ??
      readExtractedString(
        record.extractedData,
        "requestedService"
      ),
    messagePreview: createMessagePreview(record.message),
    category: record.category,
    priority: record.priority,
    summary: record.summary,
    replyRecommended: record.replyRecommended,
    hasDraft: record.responseDraft !== null,
    status: record.status,
    confidence: record.confidence
  };
}

function toDetailResponse(record: AdminInquiryDetailRecord) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    original: {
      source: record.source,
      sourceReference: record.sourceReference,
      name: record.name,
      email: record.email,
      phone: record.phone,
      service: record.service,
      message: record.message,
      consentToStore: record.consentToStore
    },
    analysis: {
      category: record.category,
      priority: record.priority,
      sentiment: record.sentiment,
      language: record.language,
      confidence: record.confidence,
      summary: record.summary,
      extractedData: record.extractedData,
      missingFields: record.missingFields,
      riskFlags: record.riskFlags,
      reply: {
        recommended: record.replyRecommended,
        reason: record.replyRecommendationReason,
        draft: record.responseDraft
      },
      humanReview: {
        required: true,
        nextAction: record.nextAction,
        reason: record.actionReason
      },
      errorCode: record.analysisErrorCode,
      analyzedAt: record.analyzedAt,
      promptVersion: record.aiPromptVersion
    },
    duplicateOf: record.duplicateOf,
    auditEvents: record.events
  };
}

export class AdminInquiryService {
  public constructor(
    private readonly repository: AdminInquiryRepository
  ) {}

  public async list(query: AdminInquiryListQuery) {
    const { records, total } =
      await this.repository.list(query);

    return {
      items: records.map(toTableRow),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages:
          total === 0 ? 0 : Math.ceil(total / query.limit)
      }
    };
  }

  public async getById(inquiryId: string) {
    const inquiry = await this.repository.findById(inquiryId);

    if (!inquiry) {
      throw new AppError(
        404,
        "INQUIRY_NOT_FOUND",
        "Inquiry was not found"
      );
    }

    return toDetailResponse(inquiry);
  }
}
