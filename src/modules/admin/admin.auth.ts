import { timingSafeEqual } from "node:crypto";

import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { env } from "../../config/env.js";

const ADMIN_API_KEY_HEADER = "x-admin-api-key";

// Comparing equal-length buffers avoids leaking useful key-prefix timing data.
function apiKeysMatch(
  candidate: string,
  expected: string
): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

// This hook is registered once for the complete /api/v1/admin route scope.
export async function requireAdminApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const suppliedKey = request.headers[ADMIN_API_KEY_HEADER];

  if (
    typeof suppliedKey !== "string" ||
    !apiKeysMatch(suppliedKey, env.ADMIN_API_KEY)
  ) {
    // Never include the rejected key in logs or response details.
    request.log.warn(
      { route: request.routeOptions.url },
      "Rejected unauthenticated admin request"
    );

    reply.header("WWW-Authenticate", "ApiKey");
    await reply.status(401).send({
      error: {
        code: "ADMIN_AUTH_REQUIRED",
        message: "A valid admin API key is required"
      },
      requestId: request.id
    });
  }
}
