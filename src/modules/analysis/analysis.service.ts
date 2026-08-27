import {
  AnalysisProviderError,
  type AnalysisProvider
} from "./analysis.provider.js";
import { AnalysisRepository } from "./analysis.repository.js";

export type AnalysisProcessingOutcome =
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

// -----------------------------------------------------------------------------
// Provider-independent processing workflow
// -----------------------------------------------------------------------------
export class AnalysisService {
  public constructor(
    private readonly repository: AnalysisRepository,
    private readonly provider: AnalysisProvider,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async processInquiry(
    inquiryId: string
  ): Promise<AnalysisProcessingOutcome> {
    const inquiry =
      await this.repository.claimInquiry(inquiryId);

    if (!inquiry) {
      return "SKIPPED";
    }

    let analysis;

    try {
      const analysisDate = this.now()
        .toISOString()
        .slice(0, 10);

      analysis = await this.provider.analyze({
        analysisDate,
        companyPrompt: inquiry.companyPrompt,
        inquiry: {
          name: inquiry.name,
          email: inquiry.email,
          phone: inquiry.phone,
          service: inquiry.service,
          message: inquiry.message
        }
      });
    } catch (error) {
      // Unknown implementations are reduced to one safe code before persistence.
      const providerError =
        error instanceof AnalysisProviderError
          ? error
          : new AnalysisProviderError(
              "AI_PROVIDER_ERROR",
              false,
              { cause: error }
            );

      const stored = await this.repository.failAnalysis({
        inquiryId,
        errorCode: providerError.code,
        retryable: providerError.retryable
      });

      return stored ? "FAILED" : "SKIPPED";
    }

    const stored = await this.repository.completeAnalysis(
      inquiryId,
      analysis,
      this.now()
    );

    return stored ? "COMPLETED" : "SKIPPED";
  }
}
