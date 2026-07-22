import { z } from "zod";

// Deliberately excludes "admin" — public registration can never create an
// admin account.
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

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code."),
});

export const resendOtpSchema = z.object({
  email: emailSchema,
});
