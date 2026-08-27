import type { FastifyPluginAsync } from "fastify";

import { AppError } from "../../shared/errors.js";
import { aiSettingsRoutes } from "../settings/ai-settings.routes.js";
import { requireAdminApiKey } from "./admin.auth.js";
import { AdminInquiryRepository } from "./admin.repository.js";
import {
  adminInquiryIdParamsSchema,
  adminInquiryListQuerySchema,
  formatAdminValidationIssues
} from "./admin.schemas.js";
import { AdminInquiryService } from "./admin.service.js";

const nullableString = {
  type: "string",
  nullable: true
} as const;

const nullableBoolean = {
  type: "boolean",
  nullable: true
} as const;

const nullableNumber = {
  type: "number",
  nullable: true
} as const;

const inquiryListResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "pagination"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "createdAt",
          "customerName",
          "contact",
          "requestedService",
          "messagePreview",
          "category",
          "priority",
          "summary",
          "replyRecommended",
          "hasDraft",
          "status",
          "confidence"
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          customerName: { type: "string" },
          contact: { type: "string" },
          requestedService: nullableString,
          messagePreview: { type: "string" },
          category: nullableString,
          priority: nullableString,
          summary: nullableString,
          replyRecommended: nullableBoolean,
          hasDraft: { type: "boolean" },
          status: { type: "string" },
          confidence: nullableNumber
        }
      }
    },
    pagination: {
      type: "object",
      additionalProperties: false,
      required: [
        "page",
        "limit",
        "total",
        "totalPages"
      ],
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
        total: { type: "integer" },
        totalPages: { type: "integer" }
      }
    }
  }
} as const;

const inquiryDetailResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "createdAt",
    "updatedAt",
    "status",
    "original",
    "analysis",
    "duplicateOf",
    "auditEvents"
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    status: { type: "string" },
    original: {
      type: "object",
      additionalProperties: false,
      required: [
        "source",
        "sourceReference",
        "name",
        "email",
        "phone",
        "service",
        "message",
        "consentToStore"
      ],
      properties: {
        source: { type: "string" },
        sourceReference: nullableString,
        name: nullableString,
        email: nullableString,
        phone: nullableString,
        service: nullableString,
        message: { type: "string" },
        consentToStore: { type: "boolean" }
      }
    },
    analysis: {
      type: "object",
      additionalProperties: false,
      required: [
        "category",
        "priority",
        "sentiment",
        "language",
        "confidence",
        "summary",
        "extractedData",
        "missingFields",
        "riskFlags",
        "reply",
        "humanReview",
        "errorCode",
        "analyzedAt",
        "promptVersion"
      ],
      properties: {
        category: nullableString,
        priority: nullableString,
        sentiment: nullableString,
        language: nullableString,
        confidence: nullableNumber,
        summary: nullableString,
        extractedData: { nullable: true },
        missingFields: { nullable: true },
        riskFlags: { nullable: true },
        reply: {
          type: "object",
          additionalProperties: false,
          required: ["recommended", "reason", "draft"],
          properties: {
            recommended: nullableBoolean,
            reason: nullableString,
            draft: nullableString
          }
        },
        humanReview: {
          type: "object",
          additionalProperties: false,
          required: ["required", "nextAction", "reason"],
          properties: {
            required: { type: "boolean" },
            nextAction: nullableString,
            reason: nullableString
          }
        },
        errorCode: nullableString,
        analyzedAt: {
          type: "string",
          format: "date-time",
          nullable: true
        },
        promptVersion: {
          type: "object",
          nullable: true,
          additionalProperties: false,
          required: [
            "id",
            "version",
            "companyPrompt",
            "createdAt"
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            version: { type: "integer" },
            companyPrompt: { type: "string" },
            createdAt: {
              type: "string",
              format: "date-time"
            }
          }
        }
      }
    },
    duplicateOf: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["id", "createdAt", "status", "name", "email"],
      properties: {
        id: { type: "string", format: "uuid" },
        createdAt: { type: "string", format: "date-time" },
        status: { type: "string" },
        name: nullableString,
        email: nullableString
      }
    },
    auditEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "metadata", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string" },
          metadata: { nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      }
    }
  }
} as const;

export const adminRoutes: FastifyPluginAsync = async (
  app
) => {
  // The scoped hook protects inquiry and settings routes registered below it.
  app.addHook("preHandler", requireAdminApiKey);

  const service = new AdminInquiryService(
    new AdminInquiryRepository(app.prisma)
  );

  app.get(
    "/inquiries",
    {
      schema: {
        tags: ["Admin"],
        summary: "List inquiries in an admin-table format",
        security: [{ AdminApiKey: [] }],
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
            category: { type: "string" },
            priority: { type: "string" },
            replyRecommended: {
              type: "string",
              enum: ["true", "false"]
            },
            createdFrom: { type: "string", format: "date-time" },
            createdTo: { type: "string", format: "date-time" },
            search: { type: "string", maxLength: 200 },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 25
            },
            sortBy: {
              type: "string",
              enum: [
                "createdAt",
                "customerName",
                "requestedService",
                "category",
                "priority",
                "status"
              ],
              default: "createdAt"
            },
            sortOrder: {
              type: "string",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        },
        response: { 200: inquiryListResponseSchema }
      }
    },
    async (request) => {
      const parsed = adminInquiryListQuerySchema.safeParse(
        request.query
      );

      if (!parsed.success) {
        throw new AppError(
          422,
          "INPUT_VALIDATION_FAILED",
          "Admin inquiry filters are invalid",
          formatAdminValidationIssues(parsed.error)
        );
      }

      return service.list(parsed.data);
    }
  );

  app.get(
    "/inquiries/:id",
    {
      schema: {
        tags: ["Admin"],
        summary: "Get one inquiry with analysis and audit history",
        security: [{ AdminApiKey: [] }],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" }
          }
        },
        response: { 200: inquiryDetailResponseSchema }
      }
    },
    async (request) => {
      const parsed = adminInquiryIdParamsSchema.safeParse(
        request.params
      );

      if (!parsed.success) {
        throw new AppError(
          422,
          "INPUT_VALIDATION_FAILED",
          "Inquiry identifier is invalid",
          formatAdminValidationIssues(parsed.error)
        );
      }

      return service.getById(parsed.data.id);
    }
  );

  await app.register(aiSettingsRoutes);
};
