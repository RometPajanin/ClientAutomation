import { GoogleGenAI } from "@google/genai";

import { env } from "../../config/env.js";
import {
  analysisOutputJsonSchema,
  analysisOutputSchema,
  type AnalysisOutput
} from "./analysis.schema.js";
import type {
  AnalysisProvider,
  AnalyzeInquiryRequest
} from "./analysis.provider.js";
import {
  buildAnalysisPrompt,
  FIXED_ANALYSIS_SYSTEM_INSTRUCTION
} from "./analysis.prompt.js";

export class GeminiAnalysisProvider
  implements AnalysisProvider
{
  private readonly client: GoogleGenAI;

  public constructor(
    private readonly model = env.GEMINI_MODEL,
    apiKey = env.GEMINI_API_KEY
  ) {
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is required to use GeminiAnalysisProvider"
      );
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  public async analyze(
    request: AnalyzeInquiryRequest
  ): Promise<AnalysisOutput> {
    const interaction =
      await this.client.interactions.create({
        model: this.model,
        store: false,
        system_instruction:
          FIXED_ANALYSIS_SYSTEM_INSTRUCTION,
        input: buildAnalysisPrompt(request),
        generation_config: {
          max_output_tokens: 2_048
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: analysisOutputJsonSchema
        }
      });

    const responseText = interaction.output_text;

    if (!responseText) {
      throw new Error(
        "Gemini returned no structured response"
      );
    }

    let decodedResponse: unknown;

    try {
      decodedResponse = JSON.parse(responseText) as unknown;
    } catch {
      throw new Error("Gemini returned invalid JSON");
    }

    // Structured output reduces malformed responses, but the
    // backend must still treat the result as untrusted.
    return analysisOutputSchema.parse(decodedResponse);
  }
}