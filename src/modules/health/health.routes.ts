import type { FastifyPluginAsync, FastifyReply } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (
  app
) => {
  app.get("/health/live", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    };
  });

  async function checkReadiness(
    reply: FastifyReply
  ): Promise<unknown> {
    try {
      await app.prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime())
      };
    } catch (error) {
      app.log.warn(
        { err: error },
        "Database readiness check failed"
      );

      return reply.status(503).send({
        status: "unavailable",
        database: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  }

  app.get("/health", async (_request, reply) => {
    return checkReadiness(reply);
  });

  app.get("/health/ready", async (_request, reply) => {
    return checkReadiness(reply);
  });
};