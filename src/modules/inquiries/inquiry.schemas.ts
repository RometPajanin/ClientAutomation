import { z } from "zod";

// Form clients commonly submit optional empty fields as "" or null instead of
// omitting them.
function emptyOptionalValueToUndefined(value: unknown): unknown {
  return value === null ||
    (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(
    emptyOptionalValueToUndefined,
    z.string().trim().min(1).max(maxLength).optional()
  );
}

// Field-specific schemas both validate and perform safe, local transformations.
const optionalEmail = z.preprocess(
  emptyOptionalValueToUndefined,
  z
    .string()
    .trim()
    .max(254)
    .email("email must be a valid email address")
    .transform((value) => value.toLowerCase())
    .optional()
);

const optionalPhone = z.preprocess(
  emptyOptionalValueToUndefined,
  z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(
      /^[+0-9().\-\s]+$/,
      "phone contains unsupported characters"
    )
    .optional()
);

// Strict mode prevents misspelled or unexpected fields from silently entering storage.
export const createInquirySchema = z
  .object({
    name: optionalTrimmedString(120),
    email: optionalEmail,
    phone: optionalPhone,
    service: optionalTrimmedString(200),
    message: z.string().trim().min(10).max(10_000),
    consentToStore: z
      .boolean()
      .refine((value) => value, {
        message: "consentToStore must be true"
      }),
    sourceReference: optionalTrimmedString(200),
    // Older web clients sent this field. Accept it for compatibility, but do
    // not use it: this public endpoint assigns the trusted source server-side.
    source: optionalTrimmedString(100)
  })
  .strict()
  // Contact is a cross-field rule: either email or phone is acceptable.
  .superRefine((value, context) => {
    if (!value.email && !value.phone) {
      context.addIssue({
        code: "custom",
        message: "At least one contact method is required",
        path: ["email"]
      });
    }
  });

export type CreateInquiryInput = z.output<
  typeof createInquirySchema
>;

// Return only safe validation metadata, never the submitted field values themselves.
export function formatValidationIssues(
  error: z.ZodError
): Array<{ path: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));
}
