import cookie from "@fastify/cookie";
import fastifyPlugin from "fastify-plugin";

import { env } from "../../config/env.js";
import { AdminSessionRepository } from "./auth.repository.js";
import { AdminAuthService } from "./auth.service.js";

declare module "fastify" {
  interface FastifyInstance {
    adminAuth: AdminAuthService;
  }
}

export const adminAuthPlugin = fastifyPlugin(
  async (app) => {
    await app.register(cookie, {
      secret: env.SESSION_SECRET,
      algorithm: "sha256",
      hook: "onRequest"
    });

    app.decorateRequest("adminSession", null);
    app.decorate(
      "adminAuth",
      new AdminAuthService(
        new AdminSessionRepository(app.prisma),
        {
          username: env.ADMIN_USERNAME,
          passwordHash: env.ADMIN_PASSWORD_HASH,
          sessionSecret: env.SESSION_SECRET,
          sessionTtlSeconds: env.SESSION_TTL_SECONDS
        }
      )
    );
  },
  {
    name: "admin-auth",
    dependencies: ["database"]
  }
);
