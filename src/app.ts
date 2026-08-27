import fastify, { type FastifyInstance } from "fastify";

import { env } from "./config/env.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { inquiryRoutes } from "./modules/inquiries/inquiry.routes.js";
import { databasePlugin } from "./plugins/database.js";
import { registerErrorHandler } from "./plugins/error-handler.js";

export interface BuildAppOptions {
  logger?: boolean;
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

  // Register shared infrastructure before feature routes that depend on it.
  registerErrorHandler(app);

  app.register(databasePlugin);
  app.register(healthRoutes);
  app.register(inquiryRoutes);

  return app;
}
