import { z } from "zod";

export const withdrawSchema = z.object({
  amount: z.number().positive(),
  payoutMethod: z.enum(["UPI", "BANK_TRANSFER"]),
  payoutDetails: z.string().min(3).max(200), // a real UPI id, or "Bank: X · Acc: Y · IFSC: Z"
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
