import { createHash } from "node:crypto";

import type { CreateInquiryInput } from "./inquiry.schemas.js";

export interface NormalizedInquiry {
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  message: string;
  consentToStore: true;
  sourceReference?: string;
}

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return value.trim().startsWith("+") ? `+${digits}` : digits;
}

function normalizeMessageForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInquiry(
  input: CreateInquiryInput
): NormalizedInquiry {
  return {
    name: input.name
      ? normalizeDisplayText(input.name)
      : undefined,
    email: input.email?.normalize("NFKC").toLowerCase(),
    phone: input.phone
      ? normalizePhone(input.phone)
      : undefined,
    service: input.service
      ? normalizeDisplayText(input.service)
      : undefined,
    message: input.message
      .normalize("NFKC")
      .replace(/\r\n/g, "\n")
      .trim(),
    consentToStore: true,
    sourceReference: input.sourceReference
  };
}

export function createInquiryFingerprint(
  inquiry: NormalizedInquiry
): string {
  const contact = inquiry.email ?? inquiry.phone ?? "";
  const comparableMessage = normalizeMessageForComparison(
    inquiry.message
  );

  return createHash("sha256")
    .update(`${contact}\n${comparableMessage}`)
    .digest("hex");
}
