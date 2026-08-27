import {
  AnalysisService,
  type AnalysisProcessingOutcome
} from "./analysis.service.js";

export interface AnalysisRunnerLogger {
  info(
    bindings: Record<string, unknown>,
    message: string
  ): void;
  error(
    bindings: Record<string, unknown>,
    message: string
  ): void;
}

// -----------------------------------------------------------------------------
// Same-process asynchronous task runner
// -----------------------------------------------------------------------------
// The MVP runner keeps HTTP latency independent from Gemini latency. A durable
// queue will replace it later without changing AnalysisService.
export class InProcessAnalysisRunner {
  private readonly activeTasks = new Set<Promise<void>>();

  public constructor(
    private readonly service: AnalysisService,
    private readonly logger: AnalysisRunnerLogger
  ) {}

  public enqueue(inquiryId: string): void {
    const task = this.run(inquiryId);
    this.activeTasks.add(task);

    void task.then(() => {
      this.activeTasks.delete(task);
    });
  }

  public async drain(): Promise<void> {
    await Promise.all(this.activeTasks);
  }

  private async run(inquiryId: string): Promise<void> {
    try {
      const outcome =
        await this.service.processInquiry(inquiryId);

      this.logOutcome(inquiryId, outcome);
    } catch (error) {
      // Database failures are logged internally; no background rejection escapes.
      this.logger.error(
        { err: error, inquiryId },
        "Inquiry analysis task failed unexpectedly"
      );
    }
  }

  private logOutcome(
    inquiryId: string,
    outcome: AnalysisProcessingOutcome
  ): void {
    this.logger.info(
      { inquiryId, outcome },
      "Inquiry analysis task finished"
    );
  }
}
