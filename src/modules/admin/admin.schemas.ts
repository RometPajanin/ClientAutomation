import { z } from "zod";

import {
  InquiryCategory,
  InquiryPriority,
  InquiryStatus
} from "../../generated/prisma/enums.js";

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === ""
    ? undefined
    : value;
}

const optionalSearch = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).max(200).optional()
);

const optionalDateTime = z
  .iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

// Query validation keeps expensive database filters bounded and predictable.
export const adminInquiryListQuerySchema = z
  .object({
    status: z.enum(InquiryStatus).optional(),
    category: z.enum(InquiryCategory).optional(),
    priority: z.enum(InquiryPriority).optional(),
    replyRecommended: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    createdFrom: optionalDateTime,
    createdTo: optionalDateTime,
    search: optionalSearch,
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    sortBy: z
      .enum([
        "createdAt",
        "customerName",
        "requestedService",
        "category",
        "priority",
        "status"
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc")
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.createdFrom &&
      value.createdTo &&
      value.createdFrom > value.createdTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["createdTo"],
        message: "createdTo must not be earlier than createdFrom"
      });
    }
  });

export const adminInquiryIdParamsSchema = z
  .object({
    id: z.uuid()
  })
  .strict();

export type AdminInquiryListQuery = z.output<
  typeof adminInquiryListQuerySchema
>;

// Validation errors expose field names and rules, never submitted values.
export function formatAdminValidationIssues(
  error: z.ZodError
): Array<{ path: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));
}
