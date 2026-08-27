import "dotenv/config";
import { z } from "zod";

// Web/server environments often represent an optional secret as an empty string.
// Convert that value to undefined before applying the Zod rules.
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

// Validate configuration once during startup so later modules can use typed values.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  HOST: z.string().min(1).default("0.0.0.0"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(3000),

  LOG_LEVEL: z
    .enum([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent"
    ])
    .default("info"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),

  ADMIN_API_KEY: z
    .string()
    .min(16, "ADMIN_API_KEY must contain at least 16 characters"),

  GEMINI_API_KEY: optionalSecret,

  GEMINI_MODEL: z
    .string()
    .min(1)
    .default("gemini-3.1-flash-lite"),

  GEMINI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(20_000),

  // This is the number of retries after the first request, not total attempts.
  GEMINI_MAX_RETRIES: z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .default(2),

  INQUIRY_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(10),

  INQUIRY_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),

  DUPLICATE_WINDOW_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24)
});

const parsed = envSchema.safeParse(process.env);

// Fail fast instead of allowing a missing setting to cause a less clear runtime error.
if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${message}`);
}

export const env = parsed.data;
export type Environment = typeof env;
