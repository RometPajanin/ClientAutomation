import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { env } from "../../config/env.js";

export interface AuthenticatedAdminSession {
  id: string;
  tokenHash: string;
  username: string;
  expiresAt: Date;
  csrfToken: string;
}

declare module "fastify" {
  interface FastifyRequest {
    adminSession: AuthenticatedAdminSession | null;
  }
}

export function adminSessionCookieName(
  nodeEnv = env.NODE_ENV
): string {
  return nodeEnv === "production"
    ? "__Host-ca_session"
    : "ca_session";
}

export function adminSessionCookieOptions(
  nodeEnv = env.NODE_ENV
): {
  path: "/";
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  signed: true;
  maxAge: number;
} {
  return {
    path: "/",
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "strict",
    signed: true,
    maxAge: env.SESSION_TTL_SECONDS
  };
}

function clearAdminCookie(reply: FastifyReply): void {
  const options = adminSessionCookieOptions();
  reply.clearCookie(adminSessionCookieName(), {
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    signed: options.signed
  });
}

export async function requireAdminSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signedToken = request.cookies[adminSessionCookieName()];
  const unsigned = signedToken
    ? request.unsignCookie(signedToken)
    : null;
  const session =
    unsigned?.valid && unsigned.value
      ? await request.server.adminAuth.authenticate(unsigned.value)
      : null;

  if (!session) {
    clearAdminCookie(reply);
    reply.header("WWW-Authenticate", "Session");
    await reply.status(401).send({
      error: {
        code: "ADMIN_AUTH_REQUIRED",
        message: "An authenticated admin session is required"
      },
      requestId: request.id
    });
    return;
  }

  request.adminSession = session;
}

export async function requireAdminCsrf(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const suppliedToken = request.headers["x-csrf-token"];
  const expectedToken = request.adminSession?.csrfToken;

  if (
    typeof suppliedToken !== "string" ||
    !expectedToken ||
    !request.server.adminAuth.csrfTokenMatches(
      suppliedToken,
      expectedToken
    )
  ) {
    await reply.status(403).send({
      error: {
        code: "CSRF_TOKEN_INVALID",
        message: "A valid CSRF token is required"
      },
      requestId: request.id
    });
  }
}
