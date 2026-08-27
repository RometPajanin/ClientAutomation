import { env } from "../../config/env.js";
import type { CreateInquiryInput } from "./inquiry.schemas.js";
import {
  createInquiryFingerprint,
  normalizeInquiry
} from "./inquiry.normalization.js";
import { InquiryRepository } from "./inquiry.repository.js";
import type { CreateInquiryResult } from "./inquiry.types.js";

// Avoid depending on Prisma's concrete error class for one stable error code.
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export class InquiryService {
  public constructor(
    private readonly repository: InquiryRepository
  ) {}

  public async createInquiry(
    input: CreateInquiryInput
  ): Promise<CreateInquiryResult> {
    const inquiry = normalizeInquiry(input);

    // An idempotency key takes priority: a retried delivery returns its first result.
    if (inquiry.sourceReference) {
      const existing =
        await this.repository.findBySourceReference(
          inquiry.sourceReference
        );

      if (existing) {
        return {
          ...existing,
          idempotentReplay: true
        };
      }
    }

    // Only non-replayed requests enter the time-bounded duplicate check.
    const fingerprint = createInquiryFingerprint(inquiry);
    const duplicateWindowStart = new Date(
      Date.now() -
        env.DUPLICATE_WINDOW_HOURS * 60 * 60 * 1_000
    );
    const duplicate =
      await this.repository.findRecentOriginalByFingerprint(
        fingerprint,
        duplicateWindowStart
      );

    try {
      const created = await this.repository.create({
        inquiry,
        fingerprint,
        duplicateOfId: duplicate?.id
      });

      return {
        ...created,
        idempotentReplay: false
      };
    } catch (error) {
      // Concurrent requests may pass the first lookup together. The database
      // unique constraint decides the winner and this branch returns that record.
      if (
        inquiry.sourceReference &&
        isUniqueConstraintError(error)
      ) {
        const existing =
          await this.repository.findBySourceReference(
            inquiry.sourceReference
          );

        if (existing) {
          return {
            ...existing,
            idempotentReplay: true
          };
        }
      }

      throw error;
    }
  }
}
