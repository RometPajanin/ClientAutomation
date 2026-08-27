import { z } from "zod";

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === ""
    ? undefined
    : value;
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).max(maxLength).optional()
  );
}

const optionalEmail = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .max(254)
    .email("email must be a valid email address")
    .transform((value) => value.toLowerCase())
    .optional()
);

const optionalPhone = z.preprocess(
  emptyStringToUndefined,
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
    sourceReference: optionalTrimmedString(200)
  })
  .strict()
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

export function formatValidationIssues(
  error: z.ZodError
): Array<{ path: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));
}
