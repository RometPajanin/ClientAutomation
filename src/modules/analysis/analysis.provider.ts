import type { AnalysisOutput } from "./analysis.schema.js";

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