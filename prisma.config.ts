import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Keep Prisma CLI paths and the database connection in one central configuration.
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations"
  },

  datasource: {
    url: env("DATABASE_URL")
  }
});
