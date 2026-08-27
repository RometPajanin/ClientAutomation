import { z } from "zod";

export const adminLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(200)
  })
  .strict();

export type AdminLoginInput = z.output<typeof adminLoginSchema>;
