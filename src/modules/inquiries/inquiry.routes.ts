import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { InquiryRepository } from "./inquiry.repository.js";
import {
  createInquirySchema,
  formatValidationIssues
} from "./inquiry.schemas.js";
import { InquiryService } from "./inquiry.service.js";
import type { CreateInquiryResponse } from "./inquiry.types.js";

const MAX_REQUEST_BODY_BYTES = 20_000;

export const inquiryRoutes: FastifyPluginAsync = async (
  app
) => {
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
  const service = new InquiryService(repository);

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

      return reply.status(202).send(response);
    }
  );
};
