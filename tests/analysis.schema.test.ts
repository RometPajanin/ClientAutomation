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
  suggestedAction: "ASSIGN_TO_SALES",
  suggestedActionReason:
    "The request is a qualified sales inquiry with a deadline.",
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
  });
});
