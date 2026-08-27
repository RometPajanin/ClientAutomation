import type { InquiryStatus } from "../../generated/prisma/enums.js";

export interface CreateInquiryResult {
  id: string;
  status: InquiryStatus;
  idempotentReplay: boolean;
}

export interface CreateInquiryResponse {
  id: string;
  status: InquiryStatus;
  message: string;
}
