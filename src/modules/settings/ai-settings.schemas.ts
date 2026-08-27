import { z } from "zod";

// Empty content deliberately disables additional company-specific context.
export const updateAiSettingsSchema = z
  .object({
    companyPrompt: z.string().trim().max(5_000)
  })
  .strict();

export type UpdateAiSettingsInput = z.output<
  typeof updateAiSettingsSchema
>;
