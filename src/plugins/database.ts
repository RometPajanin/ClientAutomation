import { PrismaPg } from "@prisma/adapter-pg";
import fastifyPlugin from "fastify-plugin";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// Create one Prisma client for the Fastify application and expose it as app.prisma.
export const databasePlugin = fastifyPlugin(
  async (app) => {
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL
    });

    const prisma = new PrismaClient({
      adapter
    });

    await prisma.$connect();

    app.decorate("prisma", prisma);

    // Closing the database pool during shutdown prevents hanging Node processes.
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  },
  {
    name: "database"
  }
);
