import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
  requireAdminCsrf,
  requireAdminSession
} from "./auth.hooks.js";
import { adminLoginSchema } from "./auth.schemas.js";

const authResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["user", "csrfToken", "expiresAt"],
  properties: {
    user: {
      type: "object",
      additionalProperties: false,
      required: ["username"],
      properties: {
        username: { type: "string" }
      }
    },
    csrfToken: { type: "string" },
    expiresAt: { type: "string", format: "date-time" }
  }
} as const;

export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: false,
    max: env.AUTH_RATE_LIMIT_MAX,
    timeWindow: env.AUTH_RATE_LIMIT_WINDOW_MS
  });

  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: env.AUTH_RATE_LIMIT_MAX,
          timeWindow: env.AUTH_RATE_LIMIT_WINDOW_MS
        }
      },
      schema: {
        tags: ["Authentication"],
        summary: "Create an administrator browser session",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 100 },
            password: { type: "string", minLength: 1, maxLength: 200 }
          }
        },
        response: { 200: authResponseSchema }
      }
    },
    async (request, reply) => {
      const parsed = adminLoginSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          422,
          "INPUT_VALIDATION_FAILED",
          "Login validation failed"
        );
      }

      const session = await app.adminAuth.login(parsed.data);

      if (!session) {
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "The username or password is incorrect"
        );
      }

      reply.setCookie(
        adminSessionCookieName(),
        session.rawToken,
        adminSessionCookieOptions()
      );

      return {
        user: { username: session.username },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt
      };
    }
  );

  app.get(
    "/session",
    {
      preHandler: requireAdminSession,
      schema: {
        tags: ["Authentication"],
        summary: "Restore the current administrator session",
        security: [{ AdminSession: [] }],
        response: { 200: authResponseSchema }
      }
    },
    async (request) => ({
      user: { username: request.adminSession!.username },
      csrfToken: request.adminSession!.csrfToken,
      expiresAt: request.adminSession!.expiresAt
    })
  );

  app.post(
    "/logout",
    {
      preHandler: [requireAdminSession, requireAdminCsrf],
      schema: {
        tags: ["Authentication"],
        summary: "Revoke the current administrator session",
        security: [{ AdminSession: [], CsrfToken: [] }],
        response: { 204: { type: "null" } }
      }
    },
    async (request, reply) => {
      await app.adminAuth.logout(request.adminSession!.tokenHash);
      const options = adminSessionCookieOptions();
      reply.clearCookie(adminSessionCookieName(), {
        path: options.path,
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
        signed: options.signed
      });
      return reply.status(204).send();
    }
  );
};
