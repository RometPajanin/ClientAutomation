import { describe, expect, it } from "vitest";

import {
  createInquiryFingerprint,
  normalizeInquiry
} from "../src/modules/inquiries/inquiry.normalization.js";

// These unit tests exercise pure logic and do not connect to PostgreSQL.
describe("inquiry normalization", () => {
  it("normalizes display fields and contact information", () => {
    const normalized = normalizeInquiry({
      name: "  Mari   Maasikas  ",
      email: "MARI@EXAMPLE.COM",
      phone: "+372 555-55-555",
      service: "  Website   development ",
      message: "  We need a new website.  ",
      consentToStore: true,
      sourceReference: "form-123"
    });

    expect(normalized).toEqual({
      name: "Mari Maasikas",
      email: "mari@example.com",
      phone: "+37255555555",
      service: "Website development",
      message: "We need a new website.",
      consentToStore: true,
      sourceReference: "form-123"
    });
  });

  it("creates the same fingerprint despite casing and whitespace differences", () => {
    const first = normalizeInquiry({
      email: "customer@example.com",
      message: "Please build a customer portal.",
      consentToStore: true
    });
    const second = normalizeInquiry({
      email: "CUSTOMER@EXAMPLE.COM",
      message: "  please   BUILD a customer portal.  ",
      consentToStore: true
    });

    expect(createInquiryFingerprint(first)).toBe(
      createInquiryFingerprint(second)
    );
  });
});
