import { z } from "zod";

export const withdrawSchema = z.object({
  amount: z.number().positive(),
  destination: z.string().min(3).max(120), // e.g. "HDFC Bank ...4521" or a UPI id
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
