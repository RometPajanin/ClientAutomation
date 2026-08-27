import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { env } from "./config/env.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import {
  createConfiguredAnalysisProvider
} from "./modules/analysis/analysis.factory.js";
import type { AnalysisProvider } from "./modules/analysis/analysis.provider.js";
import { adminAuthPlugin } from "./modules/auth/auth.plugin.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { inquiryRoutes } from "./modules/inquiries/inquiry.routes.js";
import { databasePlugin } from "./plugins/database.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { securityPlugin } from "./plugins/security.js";
import { swaggerPlugin } from "./plugins/swagger.js";

export interface BuildAppOptions {
  logger?: boolean;
  analysisProvider?: AnalysisProvider | null;
}

// Constructing the application separately from starting the server lets tests
// inject requests without opening a real network port.
export function buildApp(
  options: BuildAppOptions = {}
): FastifyInstance {
  const app = fastify({
    trustProxy: env.TRUST_PROXY,
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL
          }
  });

  const analysisProvider =
    options.analysisProvider === undefined
      ? createConfiguredAnalysisProvider()
      : options.analysisProvider;

  // Register shared infrastructure before feature routes that depend on it.
  registerErrorHandler(app);

  app.register(securityPlugin);
  app.register(cors, {
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-csrf-token"]
  });
  app.register(swaggerPlugin);
  app.register(databasePlugin);
  app.register(adminAuthPlugin);
  app.register(healthRoutes);
  app.register(inquiryRoutes, { analysisProvider });
  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(adminRoutes, { prefix: "/api/v1/admin" });

  if (!analysisProvider && env.NODE_ENV !== "test") {
    app.log.warn(
      "Gemini analysis is disabled because GEMINI_API_KEY is not configured"
    );
  }

  return app;
}
