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
import { env } from "../src/config/env.js";

const testPrefix = `phase-2-test-${randomUUID()}`;

// Every stored test record receives a unique prefix so cleanup is targeted.
function createPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    name: "Mari Maasikas",
    email: `${randomUUID()}@example.com`,
    service: "Website development",
    message: "We need a new company website next month.",
    consentToStore: true,
    sourceReference: `${testPrefix}-${randomUUID()}`,
    ...overrides
  };
}

describe("POST /api/v1/inquiries", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  // Remove only records created by this suite and let relation cascades clean events.
  afterAll(async () => {
    await app.prisma.inquiry.deleteMany({
      where: {
        sourceReference: {
          startsWith: testPrefix
        }
      }
    });
    await app.close();
  });

  it("stores a normalized inquiry and its received event", async () => {
    const sourceReference = `${testPrefix}-normalized`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({
        name: "  Mari   Maasikas  ",
        email: "  MARI.NORMALIZED@EXAMPLE.COM ",
        phone: "+372 555-55-555",
        service: "  Website   development  ",
        message: "  We need a new company website next month.  ",
        sourceReference
      })
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      status: "RECEIVED",
      message: "Inquiry received"
    });

    const stored = await app.prisma.inquiry.findUnique({
      where: { sourceReference },
      include: { events: true }
    });

    expect(stored).toMatchObject({
      name: "Mari Maasikas",
      email: "mari.normalized@example.com",
      phone: "+37255555555",
      service: "Website development",
      message: "We need a new company website next month.",
      consentToStore: true,
      status: "RECEIVED"
    });
    expect(stored?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.events).toHaveLength(1);
    expect(stored?.events[0]?.type).toBe("RECEIVED");
  });

  it("accepts legacy source metadata and null optional fields", async () => {
    const sourceReference = `${testPrefix}-legacy-client`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({
        name: null,
        phone: null,
        service: null,
        source: "legacy-web-form",
        sourceReference
      })
    });

    expect(response.statusCode).toBe(202);

    const stored = await app.prisma.inquiry.findUnique({
      where: { sourceReference },
      select: {
        name: true,
        phone: true,
        service: true,
        source: true
      }
    });

    expect(stored).toEqual({
      name: null,
      phone: null,
      service: null,
      source: "WEB_FORM"
    });
  });

  it("returns the existing inquiry for an idempotent replay", async () => {
    const sourceReference = `${testPrefix}-idempotent`;
    const payload = createPayload({ sourceReference });

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({
      id: first.json().id,
      message: "Inquiry already received"
    });

    const storedCount = await app.prisma.inquiry.count({
      where: { sourceReference }
    });
    expect(storedCount).toBe(1);
  });

  it("links an equivalent recent inquiry as a duplicate", async () => {
    const email = `${randomUUID()}@example.com`;
    const firstReference = `${testPrefix}-duplicate-first`;
    const secondReference = `${testPrefix}-duplicate-second`;

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({
        email,
        message: "Please build a customer portal for our company.",
        sourceReference: firstReference
      })
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({
        email: email.toUpperCase(),
        message: "  please BUILD a   customer portal for our company. ",
        sourceReference: secondReference
      })
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({
      status: "DUPLICATE",
      message: "Inquiry received and marked as duplicate"
    });

    const duplicate = await app.prisma.inquiry.findUnique({
      where: { sourceReference: secondReference },
      include: { events: true }
    });
    expect(duplicate).toMatchObject({
      duplicateOfId: first.json().id,
      nextAction: "MARK_DUPLICATE",
      status: "DUPLICATE"
    });
    expect(duplicate?.events.map((event) => event.type)).toEqual([
      "RECEIVED",
      "MARKED_DUPLICATE"
    ]);
  });

  it("rejects an inquiry without a contact method", async () => {
    const payload = createPayload();
    delete payload.email;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: "INPUT_VALIDATION_FAILED"
      }
    });
  });

  it("requires explicit storage consent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({ consentToStore: false })
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: "INPUT_VALIDATION_FAILED"
      }
    });
  });

  it("rejects unknown input fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({ unexpectedField: "not allowed" })
    });

    expect(response.statusCode).toBe(422);
  });

  it("rejects a request body above the route limit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inquiries",
      payload: createPayload({ message: "x".repeat(21_000) })
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: {
        code: "PAYLOAD_TOO_LARGE"
      }
    });
  });

  it("rate limits repeated submissions from one client", async () => {
    // A separate app has an isolated in-memory limiter, keeping other tests independent.
    const rateLimitedApp = buildApp({ logger: false });
    await rateLimitedApp.ready();

    try {
      for (
        let index = 0;
        index < env.INQUIRY_RATE_LIMIT_MAX;
        index += 1
      ) {
        const accepted = await rateLimitedApp.inject({
          method: "POST",
          url: "/api/v1/inquiries",
          payload: createPayload({
            email: `${randomUUID()}@example.com`,
            sourceReference: `${testPrefix}-rate-${index}`
          })
        });
        expect(accepted.statusCode).toBe(202);
      }

      const limited = await rateLimitedApp.inject({
        method: "POST",
        url: "/api/v1/inquiries",
        payload: createPayload({
          sourceReference: `${testPrefix}-rate-limited`
        })
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({
        error: {
          code: "RATE_LIMIT_EXCEEDED"
        }
      });
      expect(limited.headers["retry-after"]).toBeDefined();
    } finally {
      await rateLimitedApp.close();
    }
  });
});
