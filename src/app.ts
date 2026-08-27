import fastify, { type FastifyInstance } from "fastify";

import { env } from "./config/env.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import type { AnalysisProvider } from "./modules/analysis/analysis.provider.js";
import { GeminiAnalysisProvider } from "./modules/analysis/gemini.provider.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { inquiryRoutes } from "./modules/inquiries/inquiry.routes.js";
import { databasePlugin } from "./plugins/database.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { swaggerPlugin } from "./plugins/swagger.js";

export interface BuildAppOptions {
  logger?: boolean;
  analysisProvider?: AnalysisProvider | null;
}

function createDefaultAnalysisProvider(): AnalysisProvider | null {
  // Tests must opt into an injected fake and must never spend real API quota.
  if (env.NODE_ENV === "test" || !env.GEMINI_API_KEY) {
    return null;
  }

  return new GeminiAnalysisProvider();
}

// Constructing the application separately from starting the server lets tests
// inject requests without opening a real network port.
export function buildApp(
  options: BuildAppOptions = {}
): FastifyInstance {
  const app = fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL
          }
  });

  const analysisProvider =
    options.analysisProvider === undefined
      ? createDefaultAnalysisProvider()
      : options.analysisProvider;

  // Register shared infrastructure before feature routes that depend on it.
  registerErrorHandler(app);

  app.register(swaggerPlugin);
  app.register(databasePlugin);
  app.register(healthRoutes);
  app.register(inquiryRoutes, { analysisProvider });
  app.register(adminRoutes, { prefix: "/api/v1/admin" });

  if (!analysisProvider && env.NODE_ENV !== "test") {
    app.log.warn(
      "Gemini analysis is disabled because GEMINI_API_KEY is not configured"
    );
  }

  return app;
}
