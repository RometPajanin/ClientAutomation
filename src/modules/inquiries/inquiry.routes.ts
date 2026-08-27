import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import type { AnalysisProvider } from "../analysis/analysis.provider.js";
import { AnalysisRepository } from "../analysis/analysis.repository.js";
import { InProcessAnalysisRunner } from "../analysis/analysis.runner.js";
import { AnalysisService } from "../analysis/analysis.service.js";
import { InquiryStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors.js";
import { InquiryRepository } from "./inquiry.repository.js";
import {
  createInquirySchema,
  formatValidationIssues
} from "./inquiry.schemas.js";
import { InquiryService } from "./inquiry.service.js";
import type { CreateInquiryResponse } from "./inquiry.types.js";

const MAX_REQUEST_BODY_BYTES = 20_000;

export interface InquiryRoutesOptions {
  analysisProvider: AnalysisProvider | null;
}

export const inquiryRoutes: FastifyPluginAsync<
  InquiryRoutesOptions
> = async (app, options) => {
  // Rate limiting is scoped to public inquiry routes rather than health/admin APIs.
  await app.register(rateLimit, {
    global: false,
    max: env.INQUIRY_RATE_LIMIT_MAX,
    timeWindow: env.INQUIRY_RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (request) => ({
      statusCode: 429,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later."
      },
      requestId: request.id
    })
  });

  const repository = new InquiryRepository(app.prisma);
  const service = new InquiryService(repository, {
    duplicateWindowHours: env.DUPLICATE_WINDOW_HOURS
  });
  const analysisRunner = options.analysisProvider
    ? new InProcessAnalysisRunner(
        new AnalysisService(
          new AnalysisRepository(app.prisma),
          options.analysisProvider
        ),
        app.log
      )
    : null;

  // Let active in-process tasks finish before Prisma disconnects on shutdown.
  app.addHook("onClose", async () => {
    await analysisRunner?.drain();
  });

  app.post(
    "/api/v1/inquiries",
    {
      bodyLimit: MAX_REQUEST_BODY_BYTES,
      config: {
        rateLimit: {
          max: env.INQUIRY_RATE_LIMIT_MAX,
          timeWindow: env.INQUIRY_RATE_LIMIT_WINDOW_MS
        }
      }
    },
    async (request, reply) => {
      // request.body is untrusted until the strict Zod schema accepts it.
      const parsed = createInquirySchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw new AppError(
          422,
          "INPUT_VALIDATION_FAILED",
          "Inquiry validation failed",
          formatValidationIssues(parsed.error)
        );
      }

      const result = await service.createInquiry(parsed.data);

      // Keep the public response small; internal duplicate links and audit data
      // remain available only through the future authenticated admin API.
      const message = result.idempotentReplay
        ? "Inquiry already received"
        : result.status === "DUPLICATE"
          ? "Inquiry received and marked as duplicate"
          : "Inquiry received";
      const response: CreateInquiryResponse = {
        id: result.id,
        status: result.status,
        message
      };

      request.log.info(
        {
          inquiryId: result.id,
          status: result.status,
          idempotentReplay: result.idempotentReplay
        },
        "Inquiry accepted"
      );

      // Replays and known duplicates must not spend another provider request.
      if (
        !result.idempotentReplay &&
        result.status === InquiryStatus.RECEIVED
      ) {
        analysisRunner?.enqueue(result.id);
      }

      return reply.status(202).send(response);
    }
  );
};
