import type { FastifyPluginAsync } from "fastify";

import { AppError } from "../../shared/errors.js";
import { formatAdminValidationIssues } from "../admin/admin.schemas.js";
import { AiSettingsRepository } from "./ai-settings.repository.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { updateAiSettingsSchema } from "./ai-settings.schemas.js";

const settingsResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["companyPrompt", "version", "updatedAt"],
  properties: {
    companyPrompt: { type: "string" },
    version: { type: "integer", nullable: true },
    updatedAt: {
      type: "string",
      format: "date-time",
      nullable: true
    }
  }
} as const;

export const aiSettingsRoutes: FastifyPluginAsync = async (
  app
) => {
  const service = new AiSettingsService(
    new AiSettingsRepository(app.prisma)
  );

  app.get(
    "/settings/ai",
    {
      schema: {
        tags: ["Admin"],
        summary: "Get the active company AI prompt",
        security: [{ AdminApiKey: [] }],
        response: { 200: settingsResponseSchema }
      }
    },
    async () => service.getActive()
  );

  app.put(
    "/settings/ai",
    {
      schema: {
        tags: ["Admin"],
        summary: "Create and activate a company AI prompt version",
        security: [{ AdminApiKey: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["companyPrompt"],
          properties: {
            companyPrompt: {
              type: "string",
              maxLength: 5_000,
              description:
                "Business context included in future AI analysis requests"
            }
          }
        },
        response: { 200: settingsResponseSchema }
      }
    },
    async (request) => {
      const parsed = updateAiSettingsSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw new AppError(
          422,
          "INPUT_VALIDATION_FAILED",
          "AI settings validation failed",
          formatAdminValidationIssues(parsed.error)
        );
      }

      return service.update(parsed.data);
    }
  );
};
