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
import { loginAsDemoAdmin } from "./helpers/auth.js";

const testToken = randomUUID();
const testPrefix = `phase-5-test-${testToken}`;
describe("Phase 5 admin API", () => {
  let app: FastifyInstance;
  let adminHeaders: {
    cookie: string;
    "x-csrf-token": string;
  };
  let salesInquiryId: string;
  let detailPromptId: string;
  let originalActivePromptIds: string[] = [];
  const settingPromptIds: string[] = [];

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
    const authenticated = await loginAsDemoAdmin(app);
    adminHeaders = {
      cookie: authenticated.cookie,
      "x-csrf-token": authenticated.csrfToken
    };

    const activePrompts =
      await app.prisma.aiPromptVersion.findMany({
        where: { isActive: true },
        select: { id: true }
      });
    originalActivePromptIds = activePrompts.map(
      (prompt) => prompt.id
    );

    // A separate immutable version demonstrates the prompt reference in detail.
    const detailPrompt = await app.prisma.aiPromptVersion.create({
      data: {
        version:
          1_600_000_000 +
          Math.floor(Math.random() * 100_000_000),
        companyPrompt: "Synthetic Phase 5 detail prompt",
        isActive: false,
        createdBy: "phase-5-test"
      }
    });
    detailPromptId = detailPrompt.id;

    const sales = await app.prisma.inquiry.create({
      data: {
        createdAt: new Date("2026-08-26T09:30:00.000Z"),
        sourceReference: `${testPrefix}-sales`,
        name: `Phase Five Customer ${testToken}`,
        email: `phase-five-${testToken}@example.com`,
        service: `Website development ${testToken}`,
        message:
          "Please create a company website before the end of next month.",
        consentToStore: true,
        fingerprint: randomUUID().replaceAll("-", ""),
        status: "READY",
        category: "SALES",
        priority: "HIGH",
        sentiment: "NEUTRAL",
        language: "en",
        confidence: 0.91,
        summary:
          "The customer needs a company website next month.",
        extractedData: {
          name: `Phase Five Customer ${testToken}`,
          requestedService: `Website development ${testToken}`
        },
        missingFields: ["budget"],
        riskFlags: [],
        nextAction: "HUMAN_REVIEW",
        actionReason: "Every inquiry requires human review.",
        replyRecommended: true,
        replyRecommendationReason:
          "This is a legitimate sales inquiry.",
        responseDraft:
          "Thank you for contacting us about your website project.",
        analyzedAt: new Date("2026-08-26T09:31:00.000Z"),
        aiPromptVersionId: detailPrompt.id,
        events: {
          create: [
            { type: "RECEIVED", metadata: { source: "WEB_FORM" } },
            {
              type: "ANALYSIS_COMPLETED",
              metadata: { category: "SALES" }
            }
          ]
        }
      }
    });
    salesInquiryId = sales.id;

    await app.prisma.inquiry.create({
      data: {
        createdAt: new Date("2026-08-26T09:29:00.000Z"),
        sourceReference: `${testPrefix}-spam`,
        name: `Phase Five Sender ${testToken}`,
        email: `phase-five-spam-${testToken}@example.com`,
        message: "Unrelated synthetic promotional message for testing.",
        consentToStore: true,
        fingerprint: randomUUID().replaceAll("-", ""),
        status: "READY",
        category: "SPAM",
        priority: "LOW",
        sentiment: "NEUTRAL",
        language: "en",
        confidence: 0.98,
        summary: "The message is non-actionable spam.",
        extractedData: {
          name: `Phase Five Sender ${testToken}`,
          requestedService: null
        },
        missingFields: [],
        riskFlags: ["spam"],
        nextAction: "HUMAN_REVIEW",
        actionReason: "Every inquiry requires human review.",
        replyRecommended: false,
        replyRecommendationReason:
          "The message is non-actionable spam.",
        responseDraft: null,
        analyzedAt: new Date("2026-08-26T09:30:00.000Z"),
        events: {
          create: [{ type: "RECEIVED" }]
        }
      }
    });
  });

  afterAll(async () => {
    await app.prisma.inquiry.deleteMany({
      where: {
        sourceReference: { startsWith: testPrefix }
      }
    });

    if (settingPromptIds.length > 0) {
      await app.prisma.aiPromptVersion.deleteMany({
        where: { id: { in: settingPromptIds } }
      });
    }

    await app.prisma.aiPromptVersion.delete({
      where: { id: detailPromptId }
    });

    // Restore prompt activation state that existed before this test suite.
    await app.prisma.aiPromptVersion.updateMany({
      data: { isActive: false }
    });
    if (originalActivePromptIds.length > 0) {
      await app.prisma.aiPromptVersion.updateMany({
        where: { id: { in: originalActivePromptIds } },
        data: { isActive: true }
      });
    }

    await app.close();
  });

  it("rejects missing and invalid admin sessions", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/admin/inquiries"
    });
    const incorrect = await app.inject({
      method: "GET",
      url: "/api/v1/admin/settings/ai",
      headers: { cookie: "ca_session=invalid-session" }
    });

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({
      error: { code: "ADMIN_AUTH_REQUIRED" }
    });
    expect(missing.headers["www-authenticate"]).toBe("Session");
    expect(incorrect.statusCode).toBe(401);
  });

  it("rejects a state-changing admin request without CSRF", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/settings/ai",
      headers: { cookie: adminHeaders.cookie },
      payload: { companyPrompt: "This update must be rejected." }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "CSRF_TOKEN_INVALID" }
    });
  });

  it("returns filtered table-ready inquiry rows", async () => {
    const response = await app.inject({
      method: "GET",
      url:
        "/api/v1/admin/inquiries" +
        `?search=${encodeURIComponent(testToken)}` +
        "&status=READY&category=SALES&priority=HIGH" +
        "&replyRecommended=true&page=1&limit=25",
      headers: adminHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: salesInquiryId,
          createdAt: "2026-08-26T09:30:00.000Z",
          customerName: `Phase Five Customer ${testToken}`,
          contact: `phase-five-${testToken}@example.com`,
          requestedService: `Website development ${testToken}`,
          messagePreview:
            "Please create a company website before the end of next month.",
          category: "SALES",
          priority: "HIGH",
          summary:
            "The customer needs a company website next month.",
          replyRecommended: true,
          hasDraft: true,
          status: "READY",
          confidence: 0.91
        }
      ],
      pagination: {
        page: 1,
        limit: 25,
        total: 1,
        totalPages: 1
      }
    });
  });

  it("searches requested services", async () => {
    const response = await app.inject({
      method: "GET",
      url:
        "/api/v1/admin/inquiries" +
        `?search=${encodeURIComponent(`Website development ${testToken}`)}`,
      headers: adminHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ id: salesInquiryId }],
      pagination: { total: 1 }
    });
  });

  it("supports stable sorting and pagination", async () => {
    const response = await app.inject({
      method: "GET",
      url:
        "/api/v1/admin/inquiries" +
        `?search=${encodeURIComponent(testToken)}` +
        "&sortBy=createdAt&sortOrder=asc&page=1&limit=1",
      headers: adminHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          category: "SPAM",
          replyRecommended: false,
          hasDraft: false
        }
      ],
      pagination: {
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2
      }
    });
  });

  it("returns full inquiry detail without internal fingerprint data", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/inquiries/${salesInquiryId}`,
      headers: adminHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: salesInquiryId,
      status: "READY",
      original: {
        email: `phase-five-${testToken}@example.com`,
        message:
          "Please create a company website before the end of next month."
      },
      analysis: {
        category: "SALES",
        priority: "HIGH",
        reply: {
          recommended: true,
          reason: "This is a legitimate sales inquiry.",
          draft:
            "Thank you for contacting us about your website project."
        },
        humanReview: {
          required: true,
          nextAction: "HUMAN_REVIEW"
        },
        promptVersion: {
          id: detailPromptId,
          companyPrompt: "Synthetic Phase 5 detail prompt"
        }
      }
    });
    expect(response.json()).not.toHaveProperty("fingerprint");
    expect(response.json().auditEvents).toHaveLength(2);
  });

  it("returns a safe not-found error for an unknown inquiry", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/inquiries/${randomUUID()}`,
      headers: adminHeaders
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "INQUIRY_NOT_FOUND" }
    });
  });

  it("creates immutable active company-prompt versions", async () => {
    const first = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/settings/ai",
      headers: adminHeaders,
      payload: {
        companyPrompt: `  Phase 5 company context ${testToken}.  `
      }
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      companyPrompt: `Phase 5 company context ${testToken}.`
    });
    expect(first.json().version).toEqual(expect.any(Number));
    expect(first.json().updatedAt).toEqual(expect.any(String));

    const firstStored =
      await app.prisma.aiPromptVersion.findUniqueOrThrow({
        where: { version: first.json().version }
      });
    settingPromptIds.push(firstStored.id);
    expect(firstStored.isActive).toBe(true);
    expect(firstStored.createdBy).toBe("admin");

    const reset = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/settings/ai",
      headers: adminHeaders,
      payload: { companyPrompt: "" }
    });

    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({
      companyPrompt: "",
      version: first.json().version + 1
    });

    const resetStored =
      await app.prisma.aiPromptVersion.findUniqueOrThrow({
        where: { version: reset.json().version }
      });
    settingPromptIds.push(resetStored.id);

    const oldVersion =
      await app.prisma.aiPromptVersion.findUniqueOrThrow({
        where: { id: firstStored.id }
      });
    expect(oldVersion.companyPrompt).toBe(
      `Phase 5 company context ${testToken}.`
    );
    expect(oldVersion.isActive).toBe(false);
    expect(resetStored.isActive).toBe(true);

    const current = await app.inject({
      method: "GET",
      url: "/api/v1/admin/settings/ai",
      headers: adminHeaders
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual(reset.json());

    // Prompt changes affect future analysis, not already-linked inquiries.
    const unchangedInquiry =
      await app.prisma.inquiry.findUniqueOrThrow({
        where: { id: salesInquiryId },
        select: { aiPromptVersionId: true }
      });
    expect(unchangedInquiry.aiPromptVersionId).toBe(detailPromptId);
  });

  it("publishes the Phase 5 endpoints in OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/documentation/json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: "3.0.3",
      components: {
        securitySchemes: {
          AdminSession: {
            type: "apiKey",
            in: "cookie",
            name: "ca_session"
          },
          CsrfToken: {
            type: "apiKey",
            in: "header",
            name: "x-csrf-token"
          }
        }
      }
    });
    expect(response.json().paths).toHaveProperty(
      "/api/v1/admin/inquiries"
    );
    expect(response.json().paths).toHaveProperty(
      "/api/v1/admin/inquiries/{id}"
    );
    expect(response.json().paths).toHaveProperty(
      "/api/v1/admin/settings/ai"
    );
  });
});
