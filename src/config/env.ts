import "dotenv/config";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const DEMO_ADMIN_PASSWORD_HASH =
  "scrypt$16384$8$5$qXLKXP6hX9Jq4_Cir9K2-Q$M_BDYdYf7i3cKQmktvYPxh9Tce3RpnVOIgh8Xfh6uX8";

// Web/server environments often represent an optional secret as an empty string.
// Convert that value to undefined before applying the Zod rules.
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const optionalProxy = z.preprocess(
  (value) =>
    value === "" || value === undefined || value === "false"
      ? false
      : value === "true"
        ? true
      : value,
  z.union([z.boolean(), z.string().min(1)]).default(false)
);

const optionalBoolean = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  },
  z.boolean().optional()
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

  ADMIN_USERNAME: z.string().trim().min(1).max(100).default("admin"),

  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(
      /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
      "ADMIN_PASSWORD_HASH must use the documented scrypt format"
    )
    .default(DEMO_ADMIN_PASSWORD_HASH),

  SESSION_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional()
  ),

  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(7 * 24 * 60 * 60)
    .default(8 * 60 * 60),

  AUTH_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5),

  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(15 * 60 * 1_000),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
    .refine((origins) => origins.length > 0, {
      message: "At least one CORS origin is required"
    }),

  TRUST_PROXY: optionalProxy,

  REQUIRE_HTTPS: optionalBoolean,

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

if (
  parsed.data.NODE_ENV === "production" &&
  !parsed.data.SESSION_SECRET
) {
  throw new Error(
    "Invalid environment configuration: SESSION_SECRET is required in production"
  );
}

export const env = {
  ...parsed.data,
  SESSION_SECRET:
    parsed.data.SESSION_SECRET ??
    randomBytes(32).toString("base64url"),
  REQUIRE_HTTPS:
    parsed.data.REQUIRE_HTTPS ??
    parsed.data.NODE_ENV === "production"
};
export type Environment = typeof env;
