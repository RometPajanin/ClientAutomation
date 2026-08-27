import helmet from "@fastify/helmet";
import fastifyPlugin from "fastify-plugin";

import { env } from "../config/env.js";

const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'";

export const securityPlugin = fastifyPlugin(
  async (app) => {
    await app.register(helmet, {
      global: true,
      contentSecurityPolicy: false,
      hsts: false,
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" }
    });

    app.addHook("onRequest", async (request, reply) => {
      if (env.REQUIRE_HTTPS && request.protocol !== "https") {
        return reply.status(400).send({
          error: {
            code: "HTTPS_REQUIRED",
            message: "HTTPS is required"
          },
          requestId: request.id
        });
      }
    });

    app.addHook("onSend", async (request, reply, payload) => {
      reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
      );

      if (!request.url.startsWith("/documentation")) {
        reply.header(
          "Content-Security-Policy",
          API_CONTENT_SECURITY_POLICY
        );
      }

      if (
        request.url.startsWith("/api/v1/admin") ||
        request.url.startsWith("/api/v1/auth")
      ) {
        reply.header("Cache-Control", "no-store");
      }

      if (request.protocol === "https") {
        reply.header(
          "Strict-Transport-Security",
          "max-age=31536000"
        );
      }

      return payload;
    });
  },
  { name: "security" }
);
