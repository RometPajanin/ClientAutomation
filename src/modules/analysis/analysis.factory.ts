import { env } from "../../config/env.js";
import type { AnalysisProvider } from "./analysis.provider.js";
import { GeminiAnalysisProvider } from "./gemini.provider.js";

// This composition boundary is the only place that selects and configures the
// concrete AI vendor. The workflow depends only on AnalysisProvider.
export function createConfiguredAnalysisProvider(): AnalysisProvider | null {
  if (env.NODE_ENV === "test" || !env.GEMINI_API_KEY) {
    return null;
  }

  return new GeminiAnalysisProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    timeoutMs: env.GEMINI_TIMEOUT_MS,
    maxRetries: env.GEMINI_MAX_RETRIES
  });
}
