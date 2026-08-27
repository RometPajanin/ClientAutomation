import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { env } from "../../config/env.js";
import {
  analysisOutputJsonSchema,
  analysisOutputSchema,
  type AnalysisOutput
} from "./analysis.schema.js";
import {
  AnalysisProviderError,
  type AnalysisProvider,
  type AnalyzeInquiryRequest
} from "./analysis.provider.js";
import {
  buildAnalysisPrompt,
  FIXED_ANALYSIS_SYSTEM_INSTRUCTION
} from "./analysis.prompt.js";

// -----------------------------------------------------------------------------
// Small SDK boundary
// -----------------------------------------------------------------------------
interface GeminiInteractionResponse {
  output_text?: string;
}

interface GeminiRequestOptions {
  timeout: number;
  maxRetries: number;
}

function createGeminiRequest(request: AnalyzeInquiryRequest) {
  return {
    model: "",
    store: false,
    stream: false as const,
    system_instruction: FIXED_ANALYSIS_SYSTEM_INSTRUCTION,
    input: buildAnalysisPrompt(request),
    generation_config: {
      max_output_tokens: 2_048
    },
    response_format: {
      type: "text" as const,
      mime_type: "application/json",
      schema: analysisOutputJsonSchema
    }
  };
}

type GeminiRequest = ReturnType<typeof createGeminiRequest>;
type CreateInteraction = (
  request: GeminiRequest,
  options: GeminiRequestOptions
) => Promise<GeminiInteractionResponse>;

export interface GeminiAnalysisProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  // Tests inject this boundary so they never contact the real Gemini service.
  createInteraction?: CreateInteraction;
}

// -----------------------------------------------------------------------------
// Safe provider-error classification
// -----------------------------------------------------------------------------
function readHttpStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
}

function mapGeminiError(error: unknown): AnalysisProviderError {
  const status = readHttpStatus(error);

  if (
    status === 408 ||
    (error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name))
  ) {
    return new AnalysisProviderError(
      "AI_TIMEOUT",
      true,
      { cause: error }
    );
  }

  if (status === 429) {
    return new AnalysisProviderError(
      "AI_QUOTA_EXCEEDED",
      true,
      { cause: error }
    );
  }

  if (status === 401 || status === 403) {
    return new AnalysisProviderError(
      "AI_AUTHENTICATION_FAILED",
      false,
      { cause: error }
    );
  }

  if (
    (status !== undefined && status >= 500) ||
    error instanceof TypeError
  ) {
    return new AnalysisProviderError(
      "AI_PROVIDER_UNAVAILABLE",
      true,
      { cause: error }
    );
  }

  return new AnalysisProviderError(
    "AI_PROVIDER_ERROR",
    false,
    { cause: error }
  );
}

// -----------------------------------------------------------------------------
// Gemini structured-output provider
// -----------------------------------------------------------------------------
export class GeminiAnalysisProvider
  implements AnalysisProvider
{
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly createInteraction: CreateInteraction;

  public constructor(
    options: GeminiAnalysisProviderOptions = {}
  ) {
    this.model = options.model ?? env.GEMINI_MODEL;
    this.timeoutMs =
      options.timeoutMs ?? env.GEMINI_TIMEOUT_MS;
    this.maxRetries =
      options.maxRetries ?? env.GEMINI_MAX_RETRIES;

    if (options.createInteraction) {
      this.createInteraction = options.createInteraction;
      return;
    }

    const apiKey = options.apiKey ?? env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is required to use GeminiAnalysisProvider"
      );
    }

    const client = new GoogleGenAI({ apiKey });
    this.createInteraction = async (request, requestOptions) =>
      client.interactions.create(request, requestOptions);
  }

  public async analyze(
    request: AnalyzeInquiryRequest
  ): Promise<AnalysisOutput> {
    let interaction: GeminiInteractionResponse;

    try {
      const geminiRequest = createGeminiRequest(request);
      geminiRequest.model = this.model;
      interaction = await this.createInteraction(
        geminiRequest,
        {
          timeout: this.timeoutMs,
          maxRetries: this.maxRetries
        }
      );
    } catch (error) {
      throw mapGeminiError(error);
    }

    if (!interaction.output_text) {
      throw new AnalysisProviderError(
        "AI_INVALID_OUTPUT",
        false
      );
    }

    let decodedResponse: unknown;

    try {
      decodedResponse = JSON.parse(
        interaction.output_text
      ) as unknown;
    } catch (error) {
      throw new AnalysisProviderError(
        "AI_INVALID_OUTPUT",
        false,
        { cause: error }
      );
    }

    try {
      // Structured output narrows the response, but local validation remains final.
      return analysisOutputSchema.parse(decodedResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AnalysisProviderError(
          "AI_INVALID_OUTPUT",
          false,
          { cause: error }
        );
      }

      throw error;
    }
  }
}
