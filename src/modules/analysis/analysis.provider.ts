import type { AnalysisOutput } from "./analysis.schema.js";

export const ANALYSIS_PROVIDER_ERROR_CODES = [
  "AI_TIMEOUT",
  "AI_QUOTA_EXCEEDED",
  "AI_AUTHENTICATION_FAILED",
  "AI_INVALID_OUTPUT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_ERROR"
] as const;

export type AnalysisProviderErrorCode =
  (typeof ANALYSIS_PROVIDER_ERROR_CODES)[number];

// Provider failures expose stable internal codes without leaking SDK messages,
// API keys, request contents, or model responses into stored audit data.
export class AnalysisProviderError extends Error {
  public constructor(
    public readonly code: AnalysisProviderErrorCode,
    public readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "AnalysisProviderError";
  }
}

export interface InquiryAnalysisSource {
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  message: string;
}

export interface AnalyzeInquiryRequest {
  inquiry: InquiryAnalysisSource;
  companyPrompt: string;
  analysisDate: string;
}

export interface AnalysisProvider {
  analyze(
    request: AnalyzeInquiryRequest
  ): Promise<AnalysisOutput>;
}
