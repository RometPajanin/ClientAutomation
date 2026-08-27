import type { FastifyInstance } from "fastify";

import { AppError } from "../shared/errors.js";

function hasValidationErrors(
  error: unknown
): error is { validation: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error
  );
}

function hasHttpStatusCode(
  error: unknown
): error is { statusCode: number; code?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

export function registerErrorHandler(
  app: FastifyInstance
): void {
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      },
      requestId: request.id
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        requestId: request.id
      });
    }

    if (hasValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.validation
        },
        requestId: request.id
      });
    }

    if (
      hasHttpStatusCode(error) &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code =
        error.statusCode === 413
          ? "PAYLOAD_TOO_LARGE"
          : error.statusCode === 429
            ? "RATE_LIMIT_EXCEEDED"
            : "BAD_REQUEST";

      const message =
        error.statusCode === 413
          ? "Request body is too large"
          : error.statusCode === 429
            ? "Too many requests. Please try again later."
            : "The request could not be processed";

      return reply.status(error.statusCode).send({
        error: {
          code,
          message
        },
        requestId: request.id
      });
    }

    request.log.error(
      { err: error },
      "Unhandled request error"
    );

    return reply.status(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred"
      },
      requestId: request.id
    });
  });
}
