import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { buildApp } from "../src/app.js";
import {
  AnalysisProviderError,
  type AnalysisProvider,
  type AnalyzeInquiryRequest
} from "../src/modules/analysis/analysis.provider.js";
import type { AnalysisOutput } from "../src/modules/analysis/analysis.schema.js";

const testPrefix = `phase-4-test-${randomUUID()}`;
const promptVersion =
  2_000_000_000 + Math.floor(Math.random() * 100_000_000);

const successfulAnalysis: AnalysisOutput = {
  language: "en",
  category: "SALES",
  priority: "HIGH",
  sentiment: "NEUTRAL",
  extracted: {
    name: "Phase Three Customer",
    email: "phase-three@example.com",
    phone: null,
    requestedService: "Website development",
    summary: "The customer wants a website within one month.",
    deadline: "2026-09-30",
    budget: "5000 EUR"
  },
  missingFields: ["scope"],
  riskFlags: [],
  reply: {
    recommended: true,
    reason: "This is a legitimate request for new work.",
    draft:
      "Thank you for contacting us. We will review your website request and get back to you."
  },
  confidence: 0.92
};

const noReplyAnalysis: AnalysisOutput = {
  ...successfulAnalysis,
  category: "SPAM",
  priority: "LOW",
  extracted: {
    ...successfulAnalysis.extracted,
    name: null,
    email: "spam-sender@example.com",
    requestedService: null,
    summary: "The message is an unrelated promotional advertisement.",
    deadline: null,
    budget: null
  },
  missingFields: [],
  reply: {
    recommended: false,
    reason: "The message is non-actionable promotional spam.",
    draft: null
  },
  confidence: 0.98
};

class FakeAnalysisProvider implements AnalysisProvider {
  public readonly requests: AnalyzeInquiryRequest[] = [];

  public async analyze(
    request: AnalyzeInquiryRequest
  ): Promise<AnalysisOutput> {
    this.requests.push(request);

    if (request.inquiry.message.includes("quota failure")) {
      throw new AnalysisProviderError(
        "AI_QUOTA_EXCEEDED",
        true
      );
    }

    if (request.inquiry.message.includes("promotional spam")) {
      return noReplyAnalysis;
    }

    return successfulAnalysis;
  }
}

async function waitForTerminalStatus(
  app: FastifyInstance,
  sourceReference: string
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const inquiry = await app.prisma.inquiry.findUnique({
      where: { sourceReference },
      include: {
        events: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (
      inquiry?.status === "READY" ||
      inquiry?.status === "ANALYSIS_FAILED"
    ) {
      return inquiry;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    `Analysis did not finish for ${sourceReference}`
  );
}

describe("asynchronous inquiry analysis workflow", () => {
  let app: FastifyInstance;
  const provider = new FakeAnalysisProvider();

  beforeAll(async () => {
    app = buildApp({
      logger: false,
      analysisProvider: provider
    });
    await app.ready();

    await app.prisma.aiPromptVersion.create({
      data: {
        version: promptVersion,
        companyPrompt:
          "Phase 4 test company prompt. Never promise a fixed price.",
        isActive: true,
        createdBy: "automated-test"
      }
    });
  });

  afterAll(async () => {
    await app.prisma.inquiry.deleteMany({
      where: {
        sourceReference: { startsWith: testPrefix }
      }
    });
    await app.prisma.aiPromptVersion.delete({
      where: { version: promptVersion }
    });
    await app.close();
  });

  it("enriches and persists a fresh inquiry using the active prompt", async () => {
    const sourceReference = `${testPrefix}-success`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: {
        name: "Phase Three Customer",
        email: "phase-three@example.com",
        service: "Website development",
        message:
          "Please build our website within one month for 5000 EUR.",
        consentToStore: true,
        sourceReference
      }
    });

    // The public request is not delayed by the provider call.
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      status: "RECEIVED"
    });

    const stored = await waitForTerminalStatus(
      app,
      sourceReference
    );

    expect(stored).toMatchObject({
      status: "READY",
      category: "SALES",
      priority: "HIGH",
      sentiment: "NEUTRAL",
      language: "en",
      confidence: 0.92,
      summary:
        "The customer wants a website within one month.",
      replyRecommended: true,
      replyRecommendationReason:
        "This is a legitimate request for new work.",
      responseDraft:
        "Thank you for contacting us. We will review your website request and get back to you.",
      nextAction: "HUMAN_REVIEW",
      actionReason:
        "Every AI-analyzed inquiry requires human review before any response or action.",
      analysisErrorCode: null
    });
    expect(stored.aiPromptVersionId).not.toBeNull();
    expect(stored.extractedData).toEqual(
      successfulAnalysis.extracted
    );
    expect(stored.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "RECEIVED",
        "ANALYSIS_STARTED",
        "ANALYSIS_COMPLETED",
        "DRAFT_CREATED"
      ])
    );
    expect(provider.requests.at(-1)).toMatchObject({
      companyPrompt:
        "Phase 4 test company prompt. Never promise a fixed price.",
      inquiry: {
        message:
          "Please build our website within one month for 5000 EUR."
      }
    });
  });

  it("stores a no-reply recommendation without creating a draft", async () => {
    const sourceReference = `${testPrefix}-spam`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: {
        email: "spam-sender@example.com",
        message:
          "This is synthetic non-actionable promotional spam content.",
        consentToStore: true,
        sourceReference
      }
    });

    expect(response.statusCode).toBe(202);

    const stored = await waitForTerminalStatus(
      app,
      sourceReference
    );

    expect(stored).toMatchObject({
      status: "READY",
      category: "SPAM",
      priority: "LOW",
      replyRecommended: false,
      replyRecommendationReason:
        "The message is non-actionable promotional spam.",
      responseDraft: null,
      nextAction: "HUMAN_REVIEW"
    });
    expect(stored.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "ANALYSIS_COMPLETED",
        "REPLY_NOT_RECOMMENDED"
      ])
    );
  });

  it("preserves the original inquiry when the provider quota is exhausted", async () => {
    const sourceReference = `${testPrefix}-quota`;
    const originalMessage =
      "This synthetic inquiry triggers a quota failure test.";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: {
        email: "quota-test@example.com",
        message: originalMessage,
        consentToStore: true,
        sourceReference
      }
    });

    expect(response.statusCode).toBe(202);

    const stored = await waitForTerminalStatus(
      app,
      sourceReference
    );

    expect(stored).toMatchObject({
      status: "ANALYSIS_FAILED",
      message: originalMessage,
      email: "quota-test@example.com",
      analysisErrorCode: "AI_QUOTA_EXCEEDED",
      category: null,
      summary: null
    });
    expect(stored.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "RECEIVED",
        "ANALYSIS_STARTED",
        "ANALYSIS_FAILED"
      ])
    );
  });
});
