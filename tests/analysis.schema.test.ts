import { describe, expect, it } from "vitest";
import {
  analysisOutputJsonSchema,
  analysisOutputSchema
} from "../src/modules/analysis/analysis.schema.js";

// A realistic valid response is reused so each negative test changes only the
// rule it is intended to verify.
const validAnalysis = {
  language: "en",
  category: "SALES",
  priority: "HIGH",
  sentiment: "NEUTRAL",
  extracted: {
    name: "Mari Maasikas",
    email: "mari@example.com",
    phone: "+37255555555",
    requestedService: "Website development",
    summary:
      "The customer needs a company website by the end of next month.",
    deadline: "2026-09-30",
    budget: null
  },
  missingFields: ["budget"],
  riskFlags: [],
  reply: {
    recommended: true,
    reason:
      "The request is a legitimate sales inquiry.",
    draft:
      "Thank you for contacting us. We will review your website request and get back to you."
  },
  confidence: 0.91
} as const;

describe("analysisOutputSchema", () => {
  it("accepts and returns a complete valid analysis", () => {
    expect(analysisOutputSchema.parse(validAnalysis)).toEqual(
      validAnalysis
    );
  });

  it("accepts null for facts that were not provided", () => {
    const result = analysisOutputSchema.parse({
      ...validAnalysis,
      extracted: {
        ...validAnalysis.extracted,
        name: null,
        email: null,
        phone: null,
        requestedService: null,
        deadline: null
      },
      missingFields: [
        "name",
        "contact",
        "requestedService",
        "deadline",
        "budget"
      ]
    });

    expect(result.extracted.name).toBeNull();
  });

  it.each([
    ["unknown category", { category: "MARKETING" }],
    ["out-of-range confidence", { confidence: 1.01 }],
    [
      "invalid deadline",
      {
        extracted: {
          ...validAnalysis.extracted,
          deadline: "next month"
        }
      }
    ],
    [
      "invalid extracted email",
      {
        extracted: {
          ...validAnalysis.extracted,
          email: "not-an-email"
        }
      }
    ],
    [
      "duplicate risk flags",
      {
        riskFlags: ["LEGAL_THREAT", "LEGAL_THREAT"]
      }
    ]
  ])("rejects %s", (_name, replacement) => {
    expect(
      analysisOutputSchema.safeParse({
        ...validAnalysis,
        ...replacement
      }).success
    ).toBe(false);
  });

  it("rejects unknown fields at the root and nested levels", () => {
    expect(
      analysisOutputSchema.safeParse({
        ...validAnalysis,
        inventedRootValue: true
      }).success
    ).toBe(false);

    expect(
      analysisOutputSchema.safeParse({
        ...validAnalysis,
        extracted: {
          ...validAnalysis.extracted,
          inventedExtractedValue: true
        }
      }).success
    ).toBe(false);
  });

  it("rejects a missing contact claim when an email or phone exists", () => {
    expect(
      analysisOutputSchema.safeParse({
        ...validAnalysis,
        missingFields: ["contact"]
      }).success
    ).toBe(false);
  });

  it.each([
    [
      "a recommendation without a draft",
      { recommended: true, reason: "Legitimate inquiry", draft: null }
    ],
    [
      "a draft when no reply is recommended",
      {
        recommended: false,
        reason: "Non-actionable spam",
        draft: "This must not be present."
      }
    ]
  ])("rejects %s", (_name, reply) => {
    expect(
      analysisOutputSchema.safeParse({
        ...validAnalysis,
        reply
      }).success
    ).toBe(false);
  });

  it("accepts a no-reply recommendation with a null draft", () => {
    const result = analysisOutputSchema.parse({
      ...validAnalysis,
      category: "SPAM",
      reply: {
        recommended: false,
        reason: "The message is non-actionable spam.",
        draft: null
      }
    });

    expect(result.missingFields).toEqual([]);
  });
});

describe("analysisOutputJsonSchema", () => {
  it("requires every output field and forbids extra object properties", () => {
    expect(analysisOutputJsonSchema.additionalProperties).toBe(
      false
    );
    expect(
      analysisOutputJsonSchema.properties.extracted
        .additionalProperties
    ).toBe(false);
    expect(analysisOutputJsonSchema.required).toEqual(
      analysisOutputJsonSchema.propertyOrdering
    );
    expect(
      analysisOutputJsonSchema.properties.extracted.required
    ).toEqual(
      analysisOutputJsonSchema.properties.extracted
        .propertyOrdering
    );
    expect(
      analysisOutputJsonSchema.properties.reply
        .additionalProperties
    ).toBe(false);
    expect(
      analysisOutputJsonSchema.properties.reply.required
    ).toEqual(
      analysisOutputJsonSchema.properties.reply
        .propertyOrdering
    );
  });
});
