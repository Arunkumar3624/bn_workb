import { z } from "zod";

export const sendSupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const resolveThreadSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]),
});
