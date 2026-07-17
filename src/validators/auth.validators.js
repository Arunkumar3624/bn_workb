import { z } from "zod";

// Deliberately excludes "admin" — public registration can never create an
// admin account. Mirrors user_role in schema.sql minus that one value.
export const registerSchema = z.object({
  role: z.enum(["worker", "business"]),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().regex(/^\d{10}$/, "Enter exactly 10 numeric digits").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

const identifierSchema = z.string().trim().min(1, "Identifier is required.");

export const sendOtpSchema = z.object({
  identifier: identifierSchema,
  role: z.enum(["worker", "business"]),
});

export const verifyOtpSchema = z.object({
  identifier: identifierSchema,
  role: z.enum(["worker", "business"]),
  otp: z.string().trim().length(6, "Enter the 6-digit code.").regex(/^[0-9]{6}$/, "Enter the 6-digit code."),
});
