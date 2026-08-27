import { z } from "zod";

// -----------------------------------------------------------------------------
// Allowed classification values
// -----------------------------------------------------------------------------
// Keep these values explicit: the AI may choose only values understood by the
// database and the later deterministic decision engine.
export const ANALYSIS_CATEGORIES = [
  "SALES",
  "SUPPORT",
  "BILLING",
  "COMPLAINT",
  "PARTNERSHIP",
  "SPAM",
  "OTHER"
] as const;

export const ANALYSIS_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT"
] as const;

export const ANALYSIS_SENTIMENTS = [
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "MIXED"
] as const;

export const ANALYSIS_MISSING_FIELDS = [
  "name",
  "contact",
  "requestedService",
  "scope",
  "deadline",
  "budget"
] as const;

export const ANALYSIS_RISK_FLAGS = [
  "PROMPT_INJECTION",
  "LEGAL_THREAT",
  "SECURITY_INCIDENT",
  "PAYMENT_CARD_DATA",
  "PERSONAL_DATA_REQUEST",
  "THREAT_OR_ABUSE",
  "SENSITIVE_DATA",
  "OTHER"
] as const;

// Duplicate handling is intentionally absent. The server detects duplicates
// before AI analysis, so the model must never make that decision.
export const ANALYSIS_SUGGESTED_ACTIONS = [
  "CREATE_DRAFT",
  "REQUEST_MISSING_INFO",
  "ASSIGN_TO_SALES",
  "ASSIGN_TO_SUPPORT",
  "HUMAN_REVIEW",
  "IGNORE_SPAM"
] as const;

// -----------------------------------------------------------------------------
// Backend validation schema
// -----------------------------------------------------------------------------
// Gemini's schema support cannot express every validation rule we need. These
// helpers add the stricter checks that run after JSON is returned by the model.
function nullableText(maxLength: number, description: string) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .nullable()
    .describe(description);
}

function uniqueEnumArray<
  TValues extends readonly [string, ...string[]]
>(
  values: TValues,
  maxItems: number,
  description: string
) {
  return z
    .array(z.enum(values))
    .max(maxItems)
    .refine(
      (items) => new Set(items).size === items.length,
      "must not contain duplicate values"
    )
    .describe(description);
}

const extractedInquirySchema = z
  .object({
    name: nullableText(
      120,
      "Customer name stated in the form or message, otherwise null."
    ),
    email: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .email()
      .nullable()
      .describe(
        "Customer email stated in the form or message, otherwise null."
      ),
    phone: z
      .string()
      .trim()
      .min(5)
      .max(32)
      .regex(/^[+0-9().\-\s]+$/)
      .nullable()
      .describe(
        "Customer phone stated in the form or message, otherwise null."
      ),
    requestedService: nullableText(
      200,
      "Requested service when it is explicitly known, otherwise null."
    ),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .describe("A concise factual summary of the customer inquiry."),
    deadline: z
      .iso
      .date()
      .nullable()
      .describe(
        "Explicit or unambiguously calculable deadline in YYYY-MM-DD format; do not guess."
      ),
    budget: nullableText(
      100,
      "Budget including its currency or range when stated, otherwise null."
    )
  })
  .strict();

export const analysisOutputSchema = z
  .object({
    language: z
      .string()
      .regex(/^[a-z]{2,3}$/)
      .describe(
        "Lowercase ISO 639 language code detected from the inquiry."
      ),
    category: z.enum(ANALYSIS_CATEGORIES),
    priority: z.enum(ANALYSIS_PRIORITIES),
    sentiment: z.enum(ANALYSIS_SENTIMENTS),
    extracted: extractedInquirySchema,
    missingFields: uniqueEnumArray(
      ANALYSIS_MISSING_FIELDS,
      ANALYSIS_MISSING_FIELDS.length,
      "Information still needed before the company can properly handle the inquiry."
    ),
    riskFlags: uniqueEnumArray(
      ANALYSIS_RISK_FLAGS,
      ANALYSIS_RISK_FLAGS.length,
      "Safety or business risks that require deterministic handling or human review."
    ),
    suggestedAction: z.enum(ANALYSIS_SUGGESTED_ACTIONS),
    suggestedActionReason: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .describe(
        "A factual explanation for the suggestion; server rules make the final decision."
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Model-estimated confidence from 0 to 1; this value is not trusted by itself."
      )
  })
  .strict();

export type AnalysisOutput = z.output<
  typeof analysisOutputSchema
>;

// -----------------------------------------------------------------------------
// Gemini-compatible JSON Schema
// -----------------------------------------------------------------------------
// This is intentionally limited to Gemini's supported JSON Schema keywords.
// Zod above remains the final authority after the provider parses the response.
export const analysisOutputJsonSchema = {
  type: "object",
  title: "CustomerInquiryAnalysis",
  description:
    "Structured analysis of one untrusted customer inquiry.",
  additionalProperties: false,
  propertyOrdering: [
    "language",
    "category",
    "priority",
    "sentiment",
    "extracted",
    "missingFields",
    "riskFlags",
    "suggestedAction",
    "suggestedActionReason",
    "confidence"
  ],
  properties: {
    language: {
      type: "string",
      description:
        "Lowercase 2- or 3-letter ISO 639 language code detected from the inquiry."
    },
    category: {
      type: "string",
      enum: ANALYSIS_CATEGORIES,
      description: "The single best business category."
    },
    priority: {
      type: "string",
      enum: ANALYSIS_PRIORITIES,
      description: "How quickly a human should handle the inquiry."
    },
    sentiment: {
      type: "string",
      enum: ANALYSIS_SENTIMENTS,
      description: "The customer's overall expressed sentiment."
    },
    extracted: {
      type: "object",
      description:
        "Facts extracted from the form and message. Use null rather than guessing.",
      additionalProperties: false,
      propertyOrdering: [
        "name",
        "email",
        "phone",
        "requestedService",
        "summary",
        "deadline",
        "budget"
      ],
      properties: {
        name: {
          type: ["string", "null"],
          description:
            "Customer name stated in the input, otherwise null. Maximum 120 characters."
        },
        email: {
          type: ["string", "null"],
          format: "email",
          description:
            "Customer email stated in the input, otherwise null."
        },
        phone: {
          type: ["string", "null"],
          description:
            "Customer phone stated in the input, otherwise null."
        },
        requestedService: {
          type: ["string", "null"],
          description:
            "Requested service when explicitly known, otherwise null. Maximum 200 characters."
        },
        summary: {
          type: "string",
          description:
            "Concise factual summary of the inquiry. Maximum 1000 characters."
        },
        deadline: {
          type: ["string", "null"],
          format: "date",
          description:
            "Explicit or unambiguously calculable YYYY-MM-DD deadline; otherwise null."
        },
        budget: {
          type: ["string", "null"],
          description:
            "Stated budget including currency or range, otherwise null. Maximum 100 characters."
        }
      },
      required: [
        "name",
        "email",
        "phone",
        "requestedService",
        "summary",
        "deadline",
        "budget"
      ]
    },
    missingFields: {
      type: "array",
      maxItems: ANALYSIS_MISSING_FIELDS.length,
      description:
        "Information still needed to properly handle the inquiry; use an empty array when nothing is missing.",
      items: {
        type: "string",
        enum: ANALYSIS_MISSING_FIELDS
      }
    },
    riskFlags: {
      type: "array",
      maxItems: ANALYSIS_RISK_FLAGS.length,
      description:
        "Detected safety or business risks; use an empty array when none are detected.",
      items: {
        type: "string",
        enum: ANALYSIS_RISK_FLAGS
      }
    },
    suggestedAction: {
      type: "string",
      enum: ANALYSIS_SUGGESTED_ACTIONS,
      description:
        "Model suggestion only. The server decision engine chooses the final action."
    },
    suggestedActionReason: {
      type: "string",
      description:
        "Factual reason for the suggested action. Maximum 1000 characters."
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "Model-estimated confidence from 0 to 1."
    }
  },
  required: [
    "language",
    "category",
    "priority",
    "sentiment",
    "extracted",
    "missingFields",
    "riskFlags",
    "suggestedAction",
    "suggestedActionReason",
    "confidence"
  ]
} as const;
