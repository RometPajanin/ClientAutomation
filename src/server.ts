import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

// Graceful shutdown runs Fastify hooks, including the Prisma disconnection hook.
async function shutdown(
  signal: string
): Promise<void> {
  app.log.info(
    { signal },
    "Shutting down server"
  );

  await app.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Only this entry point opens a network port; app.ts remains reusable by tests.
try {
  await app.listen({
    host: env.HOST,
    port: env.PORT
  });
} catch (error) {
  app.log.fatal(
    { err: error },
    "Server failed to start"
  );

  await app.close();
  process.exitCode = 1;
}
